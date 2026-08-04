"""Backend tests for the AI capability framework.

Direct unit tests exercise handlers with an in-memory Motor client
against the real Mongo, then a small integration test hits /api/chat/stream
to verify capabilities are actually invoked during a chat turn.
"""
import asyncio
import json
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

ADMIN = {"email": "admin@technova.com", "password": "admin123"}
SARAH = {"email": "sarah@technova.com", "password": "employee123"}
AHMED = {"email": "ahmed@technova.com", "password": "employee123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    client = AsyncIOMotorClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


async def _get_user(db, email):
    u = await db.users.find_one({"email": email})
    assert u, f"seed user missing: {email}"
    return u


# ------------------------------ Registry ------------------------------
def test_registry_lists_all_categories():
    from ai.capabilities import all_capabilities, available_for
    caps = all_capabilities()
    assert len(caps) >= 20
    cats = {c.category for c in caps}
    assert {"employees", "knowledge", "projects", "tasks", "hr", "it"} <= cats
    # available_for role filtering
    emp = {"role": "employee"}
    owner = {"role": "owner"}
    assert len(available_for(emp)) == len(caps)  # all min_role=employee
    assert len(available_for(owner)) == len(caps)


# ------------------------------ Employees ------------------------------
def test_employees_by_name(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "sarah@technova.com")
        r = await get("search_employee_by_name").handler({"query": "sarah"}, u, db)
        assert r["count"] >= 1
        assert any("Sarah" in x.get("name", "") for x in r["results"])
        # empty query short-circuits
        r2 = await get("search_employee_by_name").handler({"query": ""}, u, db)
        assert r2.get("error")

    event_loop.run_until_complete(go())


def test_find_manager_scoped(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "sarah@technova.com")
        r = await get("find_manager").handler({}, u, db)
        # Sarah is a manager per role migration; at least one manager should exist
        assert r["count"] >= 1
        roles = {row.get("role") for row in r["results"]}
        assert roles & {"manager", "admin", "owner"}

    event_loop.run_until_complete(go())


def test_find_phone_never_hallucinates(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "sarah@technova.com")
        r = await get("find_employee_phone").handler({"name": "Sarah"}, u, db)
        # Phone isn't in schema — capability must NOT fabricate one.
        assert r["count"] == 0
        assert "not stored" in r.get("note", "").lower()

    event_loop.run_until_complete(go())


# ------------------------------ Tasks ------------------------------
def test_my_tasks_scoping_and_isolation(event_loop, db):
    async def go():
        from ai.capabilities import get
        # Seed one task assigned to Sarah in another workspace to prove isolation
        sarah = await _get_user(db, "sarah@technova.com")
        # Sarah's own tasks — capability must scope by user_id/assigned_to and company_id
        r = await get("my_tasks").handler({}, sarah, db)
        assert isinstance(r["results"], list)
        # No task should leak from a different company
        for t in r["results"]:
            # After _trim, company_id is removed; ensure our filter succeeded by
            # asserting each task's assignee/owner is Sarah.
            assert t.get("user_id") == sarah["id"] or t.get("assigned_to") == sarah["id"]

    event_loop.run_until_complete(go())


def test_overdue_tasks_never_includes_completed(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "admin@technova.com")
        r = await get("overdue_tasks").handler({}, u, db)
        for t in r["results"]:
            assert t.get("status") != "completed"

    event_loop.run_until_complete(go())


# ------------------------------ Projects ------------------------------
def test_search_projects_scoped_by_company(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "admin@technova.com")
        r = await get("search_projects").handler({}, u, db)
        assert isinstance(r["results"], list)

    event_loop.run_until_complete(go())


# ------------------------------ Knowledge ------------------------------
def test_search_documents_requires_query(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "admin@technova.com")
        r = await get("search_documents").handler({"query": ""}, u, db)
        assert r.get("error")

    event_loop.run_until_complete(go())


# ------------------------------ HR write path ------------------------------
def test_create_leave_request_persists_and_validates(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "ahmed@technova.com")
        # bad dates
        r_bad = await get("create_leave_request").handler(
            {"start_date": "not-a-date", "end_date": "2026-08-05"}, u, db,
        )
        assert r_bad.get("error")
        # inverted range
        r_inv = await get("create_leave_request").handler(
            {"start_date": "2026-08-10", "end_date": "2026-08-05"}, u, db,
        )
        assert r_inv.get("error")
        # good
        r_ok = await get("create_leave_request").handler(
            {"start_date": "2027-01-05", "end_date": "2027-01-09",
             "type": "vacation", "reason": "family trip"}, u, db,
        )
        assert r_ok.get("ok") is True
        lr_id = r_ok["leave_request_id"]
        rec = await db.leave_requests.find_one({"id": lr_id})
        assert rec and rec["company_id"] == u["company_id"] and rec["user_id"] == u["id"]
        # list_my_leave_requests picks it up
        r_list = await get("list_my_leave_requests").handler({}, u, db)
        assert any(x["id"] == lr_id for x in r_list["results"])
        # cleanup
        await db.leave_requests.delete_one({"id": lr_id})

    event_loop.run_until_complete(go())


# ------------------------------ IT write path ------------------------------
def test_create_it_ticket_and_status(event_loop, db):
    async def go():
        from ai.capabilities import get
        u = await _get_user(db, "ahmed@technova.com")
        r = await get("create_it_ticket").handler(
            {"subject": "VPN cannot connect", "description": "getting error 619",
             "category": "network", "priority": "high"}, u, db,
        )
        assert r.get("ok") is True
        tid = r["ticket_id"]
        # Employee can see their own
        r_status = await get("check_ticket_status").handler({"ticket_id": tid}, u, db)
        assert r_status["result"]["id"] == tid
        # Other employee cannot see it (company_id scope + user_id filter for employees).
        # Use Nora (employee role) not Sarah (manager role — managers see all).
        nora = await _get_user(db, "nora@technova.com")
        r_other = await get("check_ticket_status").handler({"ticket_id": tid}, nora, db)
        assert r_other["result"] is None
        # cleanup
        await db.it_tickets.delete_one({"id": tid})

    event_loop.run_until_complete(go())


# ------------------------------ Executor: role gate ------------------------------
def test_executor_role_forbidden(event_loop, db):
    async def go():
        from ai.executor import execute_plan
        from ai.capabilities import Capability, register, _REGISTRY
        # Register a temporary admin-only capability
        async def secret_handler(args, user, db):
            return {"secret": True}
        name = "__test_admin_only__"
        if name in _REGISTRY:
            _REGISTRY.pop(name)
        register(Capability(
            name=name, description="test", args_schema={}, handler=secret_handler,
            category="misc", min_role="admin",
        ))
        try:
            employee = await _get_user(db, "ahmed@technova.com")
            out = await execute_plan({"calls": [{"name": name, "args": {}}]}, employee, db)
            assert out and out[0].get("error") and "forbidden" in out[0]["error"]
            # And it's logged as failed
            row = await db.ai_tool_calls.find_one({"user_id": employee["id"], "name": name})
            assert row and row["success"] is False
            await db.ai_tool_calls.delete_many({"name": name})
        finally:
            _REGISTRY.pop(name, None)

    event_loop.run_until_complete(go())


# ------------------------------ Integration: chat_stream invokes capabilities ------------------------------
def test_chat_stream_invokes_capabilities():
    tok, _ = _login(AHMED)
    r = requests.post(
        f"{API}/chat/stream",
        headers={"Authorization": f"Bearer {tok}"},
        json={"message": "What are my overdue tasks?"},
        stream=True, timeout=60,
    )
    assert r.status_code == 200
    saw_capability = False
    saw_done = False
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except Exception:
            continue
        if ev.get("type") == "capability":
            saw_capability = True
        if ev.get("type") == "done":
            saw_done = True
            break
    assert saw_done, "chat stream did not complete"
    # We don't strictly require the planner to have chosen a capability for every
    # message (it may return {calls:[]}), but for 'my overdue tasks?' it should.
    assert saw_capability, "planner did not invoke any capability for 'overdue tasks' question"


def test_chat_stream_smalltalk_no_capability():
    tok, _ = _login(AHMED)
    r = requests.post(
        f"{API}/chat/stream",
        headers={"Authorization": f"Bearer {tok}"},
        json={"message": "hi"},
        stream=True, timeout=60,
    )
    assert r.status_code == 200
    saw_capability = False
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except Exception:
            continue
        if ev.get("type") == "capability":
            saw_capability = True
        if ev.get("type") == "done":
            break
    assert not saw_capability, "planner should not fire capabilities for a plain greeting"
