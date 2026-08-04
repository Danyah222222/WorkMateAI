"""Tests for the AI Action Confirmation workflow.

Covers:
  - Executor routes write capabilities to pending_actions (does NOT execute)
  - Confirm succeeds → capability runs → pending_action.status=executed
  - Cancel → status=cancelled, no side effect
  - Duplicate confirm → idempotent (returns same executed record)
  - Confirm-after-cancel → 409
  - Confirm-after-executed → 200 idempotent
  - Cross-user access forbidden
  - Role gate honored during confirm (defense-in-depth)
  - Missing required args surfaced in preview
  - Audit log rows: confirmation_requested + confirmed_executed / cancelled / failed
"""
import asyncio
import os
from pathlib import Path

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

AHMED = {"email": "ahmed@technova.com", "password": "employee123"}
NORA = {"email": "nora@technova.com", "password": "employee123"}
SARAH = {"email": "sarah@technova.com", "password": "employee123"}  # manager
ADMIN = {"email": "admin@technova.com", "password": "admin123"}     # owner


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    c = AsyncIOMotorClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


# ------------------------------ Unit-ish: executor routing ------------------------------
def test_executor_creates_pending_action_for_write(event_loop, db):
    async def go():
        from ai.executor import execute_plan
        u = await db.users.find_one({"email": "ahmed@technova.com"})
        plan = {"calls": [{"name": "create_leave_request", "args": {
            "start_date": "2027-04-01", "end_date": "2027-04-03",
            "type": "vacation", "reason": "unit-test",
        }}]}
        rows = await execute_plan(plan, u, db, conversation_id="test-conv")
        assert rows and rows[0]["pending_action"] is not None
        pa = rows[0]["pending_action"]
        assert pa["status"] == "pending"
        assert pa["capability_name"] == "create_leave_request"
        # No leave request should exist yet
        n = await db.leave_requests.count_documents(
            {"user_id": u["id"], "start_date": "2027-04-01"})
        assert n == 0
        # Audit row for confirmation_requested
        req_row = await db.ai_tool_calls.find_one(
            {"pending_action_id": pa["id"], "phase": "confirmation_requested"})
        assert req_row is not None
        # cleanup
        await db.pending_actions.delete_one({"id": pa["id"]})
        await db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]})
    event_loop.run_until_complete(go())


def test_executor_read_capability_still_runs_immediately(event_loop, db):
    async def go():
        from ai.executor import execute_plan
        u = await db.users.find_one({"email": "ahmed@technova.com"})
        rows = await execute_plan(
            {"calls": [{"name": "my_tasks", "args": {}}]},
            u, db, conversation_id="test-conv",
        )
        assert rows and rows[0]["pending_action"] is None
        assert isinstance(rows[0]["result"], dict) and "results" in rows[0]["result"]
    event_loop.run_until_complete(go())


# ------------------------------ End-to-end: HTTP flow ------------------------------
def _create_pending_via_chat_or_direct(event_loop, db, tok, user, args, cap="create_leave_request", conv_id="e2e"):
    """Bypass the LLM planner to keep tests deterministic — insert a pending_action
    directly via the same helper the executor uses. Reuses the fixture's event
    loop so Motor futures stay attached to the correct loop."""
    async def go():
        from ai import pending_actions as pa_mod
        from ai.capabilities import get as get_cap
        u = await db.users.find_one({"email": user["email"]})
        pa = await pa_mod.create(db, u, get_cap(cap), args, conversation_id=conv_id)
        await pa_mod._log_transition(db, pa, u, phase="confirmation_requested", success=True)
        return pa
    return event_loop.run_until_complete(go())


def test_full_confirm_flow_leave_request(event_loop, db):
    tok, u = _login(AHMED)
    pa = _create_pending_via_chat_or_direct(event_loop, db, tok, u, {
        "start_date": "2027-05-10", "end_date": "2027-05-14",
        "type": "vacation", "reason": "confirm-flow-test",
    })
    # GET
    r = requests.get(f"{API}/ai/pending-actions/{pa['id']}", headers=_h(tok), timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "pending"
    # Confirm
    r = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                      headers=_h(tok), json={}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "executed"
    # Idempotent: confirm again → still 200, still executed
    r2 = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                       headers=_h(tok), json={}, timeout=10)
    assert r2.status_code == 200 and r2.json()["status"] == "executed"
    # Cancel after executed → 409
    r3 = requests.post(f"{API}/ai/pending-actions/{pa['id']}/cancel",
                       headers=_h(tok), timeout=10)
    assert r3.status_code == 409
    # Leave request row should exist exactly once
    async def check():
        n = await db.leave_requests.count_documents(
            {"user_id": u["id"], "start_date": "2027-05-10"})
        return n
    n = event_loop.run_until_complete(check())
    assert n == 1
    # Audit trail
    async def audit():
        rows = await db.ai_tool_calls.find({"pending_action_id": pa["id"]}).to_list(50)
        return rows
    rows = event_loop.run_until_complete(audit())
    phases = {r.get("phase") for r in rows}
    assert "confirmation_requested" in phases
    assert "confirmed_executed" in phases
    # cleanup
    event_loop.run_until_complete(db.leave_requests.delete_many({"reason": "confirm-flow-test"}))
    event_loop.run_until_complete(db.pending_actions.delete_one({"id": pa["id"]}))
    event_loop.run_until_complete(db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]}))


def test_cancel_flow_and_confirm_after_cancel(event_loop, db):
    tok, u = _login(AHMED)
    pa = _create_pending_via_chat_or_direct(event_loop, db, tok, u, {
        "subject": "cancel-test", "description": "should be cancelled",
        "category": "software", "priority": "low",
    }, cap="create_it_ticket")
    # Cancel
    r = requests.post(f"{API}/ai/pending-actions/{pa['id']}/cancel",
                      headers=_h(tok), timeout=10)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    # Confirm after cancel → 409
    r2 = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                       headers=_h(tok), json={}, timeout=10)
    assert r2.status_code == 409, r2.text
    # IT ticket row should NOT exist
    async def check():
        n = await db.it_tickets.count_documents(
            {"user_id": u["id"], "subject": "cancel-test"})
        return n
    assert event_loop.run_until_complete(check()) == 0
    # cleanup
    event_loop.run_until_complete(db.pending_actions.delete_one({"id": pa["id"]}))
    event_loop.run_until_complete(db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]}))


def test_cross_user_access_forbidden(event_loop, db):
    tok_ahmed, u_ahmed = _login(AHMED)
    tok_nora, u_nora = _login(NORA)
    pa = _create_pending_via_chat_or_direct(event_loop, db, tok_ahmed, u_ahmed, {
        "subject": "belongs-to-ahmed", "description": "x",
        "category": "software", "priority": "low",
    }, cap="create_it_ticket")
    # Nora cannot cancel or confirm
    r = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                      headers=_h(tok_nora), json={}, timeout=10)
    assert r.status_code in (403, 404)  # scoped by company_id + user_id
    r = requests.post(f"{API}/ai/pending-actions/{pa['id']}/cancel",
                      headers=_h(tok_nora), timeout=10)
    assert r.status_code in (403, 404)
    # Manager (Sarah) CAN view it (approvals) but cannot cancel someone else's
    r_get = requests.get(f"{API}/ai/pending-actions/{pa['id']}", headers=_h(_login(SARAH)[0]), timeout=10)
    assert r_get.status_code == 200
    # cleanup
    event_loop.run_until_complete(db.pending_actions.delete_one({"id": pa["id"]}))
    event_loop.run_until_complete(db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]}))


def test_role_gate_on_confirm(event_loop, db):
    """Ahmed (employee) creates a pending assign_task; confirm must 403 because
    assign_task requires min_role=manager (defense-in-depth even if a pending
    action already exists)."""
    tok, u = _login(AHMED)
    # Any task in his workspace will do — grab or create one
    async def any_task():
        u_full = await db.users.find_one({"email": u["email"]})
        t = await db.tasks.find_one({"company_id": u_full["company_id"]})
        return u_full, t
    u_full, task = event_loop.run_until_complete(any_task())
    if not task:
        pytest.skip("no task available in this workspace to test assign_task")
    pa = _create_pending_via_chat_or_direct(event_loop, db, tok, u, {
        "task_id": task["id"], "assignee": "ahmed@technova.com",
    }, cap="assign_task")
    r = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                      headers=_h(tok), json={}, timeout=10)
    assert r.status_code == 403, r.text
    # Verify pending_action is now marked failed
    async def status():
        p = await db.pending_actions.find_one({"id": pa["id"]})
        return p["status"], p.get("error")
    st, err = event_loop.run_until_complete(status())
    assert st == "failed" and "forbidden" in (err or "").lower()
    # cleanup
    event_loop.run_until_complete(db.pending_actions.delete_one({"id": pa["id"]}))
    event_loop.run_until_complete(db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]}))


def test_update_task_status_write_via_confirmation(event_loop, db):
    tok, u = _login(AHMED)
    # Create a task owned by Ahmed via the tasks API so the write handler can find it
    r = requests.post(f"{API}/tasks", headers={**_h(tok), "Content-Type": "application/json"},
                      json={"title": "conf-test-task", "priority": "low",
                            "kanban_status": "todo", "status": "pending"}, timeout=10)
    assert r.status_code in (200, 201)
    task = r.json()
    try:
        pa = _create_pending_via_chat_or_direct(event_loop, db, tok, u, {
            "task_id": task["id"], "status": "completed",
        }, cap="update_task_status")
        rc = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                           headers=_h(tok), json={}, timeout=10)
        assert rc.status_code == 200 and rc.json()["status"] == "executed"
        # Verify task was completed (query DB directly since there's no GET /tasks/{id})
        async def check():
            t = await db.tasks.find_one({"id": task["id"]})
            return t["status"], t["kanban_status"]
        st, kb = event_loop.run_until_complete(check())
        assert st == "completed" and kb == "done"
    finally:
        requests.delete(f"{API}/tasks/{task['id']}", headers=_h(tok), timeout=10)


def test_missing_required_args_flagged_in_preview(event_loop, db):
    tok, u = _login(AHMED)
    # Deliberately leave `end_date` empty
    pa = _create_pending_via_chat_or_direct(event_loop, db, tok, u, {
        "start_date": "2027-06-01", "end_date": "", "type": "vacation",
    })
    assert "end_date" in (pa.get("preview") or {}).get("missing", [])
    # Confirming without providing it should fail validation inside the handler
    rc = requests.post(f"{API}/ai/pending-actions/{pa['id']}/confirm",
                       headers=_h(tok), json={}, timeout=10)
    assert rc.status_code == 500 or (rc.status_code == 200 and rc.json().get("status") == "failed")
    # cleanup
    event_loop.run_until_complete(db.pending_actions.delete_one({"id": pa["id"]}))
    event_loop.run_until_complete(db.ai_tool_calls.delete_many({"pending_action_id": pa["id"]}))
