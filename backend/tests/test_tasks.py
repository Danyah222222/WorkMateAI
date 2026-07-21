"""Backend tests for the new Tasks + productivity analytics feature.
Covers: POST/GET/PATCH/DELETE /api/tasks, /api/tasks/analytics payload shape,
correctness of totals, overdue derivation, and per-user isolation.
"""
import os
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    envp = Path("/app/frontend/.env")
    for line in envp.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

NORA = {"email": "nora@technova.com", "password": "employee123"}
AHMED = {"email": "ahmed@technova.com", "password": "employee123"}
ADMIN = {"email": "admin@technova.com", "password": "admin123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def nora_tok():
    return _login(NORA)


@pytest.fixture(scope="module")
def ahmed_tok():
    return _login(AHMED)


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN)


def _cleanup_user_tasks(tok):
    """Delete all tasks owned by this user."""
    rows = requests.get(f"{API}/tasks", headers=_h(tok), timeout=15).json()
    for r in rows:
        requests.delete(f"{API}/tasks/{r['id']}", headers=_h(tok), timeout=15)


# ---------------- Auth guard ----------------
class TestAuthGuard:
    def test_tasks_requires_auth(self):
        assert requests.get(f"{API}/tasks", timeout=10).status_code in (401, 403)

    def test_analytics_requires_auth(self):
        assert requests.get(f"{API}/tasks/analytics", timeout=10).status_code in (401, 403)


# ---------------- CRUD on tasks (uses Nora - fresh user) ----------------
class TestTasksCRUD:
    def test_00_cleanup(self, nora_tok):
        _cleanup_user_tasks(nora_tok)
        rows = requests.get(f"{API}/tasks", headers=_h(nora_tok), timeout=15).json()
        assert rows == []

    def test_create_missing_title_fails(self, nora_tok):
        r = requests.post(f"{API}/tasks", headers=_h(nora_tok), json={}, timeout=15)
        assert r.status_code in (400, 422), r.text

    def test_create_returns_full_doc_with_overdue(self, nora_tok):
        payload = {
            "title": "TEST_write PRD",
            "description": "Draft the product spec",
            "priority": "high",
            "project": "TEST_ProjectA",
            "due_date": (date.today() + timedelta(days=3)).isoformat(),
        }
        r = requests.post(f"{API}/tasks", headers=_h(nora_tok), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["priority"] == "high"
        assert d["project"] == "TEST_ProjectA"
        assert d["status"] == "pending"
        assert d["overdue"] is False
        assert "id" in d
        assert "created_at" in d
        assert d.get("completed_at") is None
        pytest.nora_task_id = d["id"]

    def test_list_only_own_tasks_and_filters(self, nora_tok):
        # create a second pending + a completed
        requests.post(f"{API}/tasks", headers=_h(nora_tok),
                      json={"title": "TEST_ship v2", "priority": "medium", "project": "TEST_ProjectB"}, timeout=15)
        r_done = requests.post(f"{API}/tasks", headers=_h(nora_tok),
                               json={"title": "TEST_done thing", "priority": "low", "status": "completed"}, timeout=15)
        assert r_done.json()["status"] == "completed"
        assert r_done.json()["completed_at"] is not None

        rows = requests.get(f"{API}/tasks", headers=_h(nora_tok), timeout=15).json()
        assert len(rows) >= 3
        # Filter by status
        pending_rows = requests.get(f"{API}/tasks?status=pending", headers=_h(nora_tok), timeout=15).json()
        assert all(x["status"] == "pending" for x in pending_rows)
        # Filter by priority
        high_rows = requests.get(f"{API}/tasks?priority=high", headers=_h(nora_tok), timeout=15).json()
        assert all(x["priority"] == "high" for x in high_rows)
        # Filter by project
        pa_rows = requests.get(f"{API}/tasks?project=TEST_ProjectA", headers=_h(nora_tok), timeout=15).json()
        assert all(x["project"] == "TEST_ProjectA" for x in pa_rows)
        assert len(pa_rows) >= 1

    def test_patch_completed_sets_completed_at_and_activity(self, nora_tok):
        tid = pytest.nora_task_id
        r = requests.patch(f"{API}/tasks/{tid}", headers=_h(nora_tok), json={"status": "completed"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        assert d["completed_at"] is not None
        # Now flip back to pending -> completed_at should clear
        r2 = requests.patch(f"{API}/tasks/{tid}", headers=_h(nora_tok), json={"status": "pending"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "pending"
        assert r2.json().get("completed_at") in (None, "")

    def test_patch_other_fields(self, nora_tok):
        tid = pytest.nora_task_id
        r = requests.patch(f"{API}/tasks/{tid}", headers=_h(nora_tok),
                           json={"title": "TEST_write PRD (v2)", "priority": "low"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_write PRD (v2)"
        assert r.json()["priority"] == "low"

    def test_delete_task(self, nora_tok):
        # Create then delete
        r = requests.post(f"{API}/tasks", headers=_h(nora_tok), json={"title": "TEST_will delete"}, timeout=15)
        tid = r.json()["id"]
        d = requests.delete(f"{API}/tasks/{tid}", headers=_h(nora_tok), timeout=15)
        assert d.status_code == 200
        # PATCH should now 404
        p = requests.patch(f"{API}/tasks/{tid}", headers=_h(nora_tok), json={"title": "x"}, timeout=15)
        assert p.status_code == 404


# ---------------- Analytics correctness ----------------
class TestAnalytics:
    def test_prepare_fresh_dataset(self, ahmed_tok):
        _cleanup_user_tasks(ahmed_tok)
        # 2 completed
        for i in range(2):
            r = requests.post(f"{API}/tasks", headers=_h(ahmed_tok),
                              json={"title": f"TEST_done_{i}", "priority": "medium", "status": "completed"},
                              timeout=15)
            assert r.status_code == 200
        # 1 overdue (past due date, pending)
        past = (date.today() - timedelta(days=2)).isoformat()
        r = requests.post(f"{API}/tasks", headers=_h(ahmed_tok),
                          json={"title": "TEST_overdue", "priority": "high", "due_date": past, "project": "TEST_LateProj"},
                          timeout=15)
        assert r.status_code == 200
        assert r.json()["overdue"] is True

    def test_analytics_payload_shape_and_numbers(self, ahmed_tok):
        r = requests.get(f"{API}/tasks/analytics", headers=_h(ahmed_tok), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # required top-level keys
        for k in ["totals", "this_week_completed", "this_month_completed", "trend_pct",
                  "avg_completion_time_hours", "most_productive_day", "most_productive_hour",
                  "weekly_series", "trend_series", "status_distribution", "priority_distribution",
                  "recent_activity", "insights"]:
            assert k in d, f"missing key {k}"
        totals = d["totals"]
        for k in ["total", "completed", "pending", "overdue", "completion_rate", "ai_sessions", "active_projects"]:
            assert k in totals, f"missing totals.{k}"
        # Numbers should match dataset (2 completed, 0 pending non-overdue, 1 overdue = 3 total)
        assert totals["total"] == 3
        assert totals["completed"] == 2
        assert totals["overdue"] == 1
        assert totals["pending"] == 0  # 1 pending item but it's overdue, so bucketed as overdue
        # completion_rate = 2/3 = 66.7
        assert abs(totals["completion_rate"] - 66.7) < 0.2
        assert totals["active_projects"] >= 1  # TEST_LateProj
        # weekly_series has 7 items
        assert len(d["weekly_series"]) == 7
        for w in d["weekly_series"]:
            assert set(w.keys()) >= {"date", "label", "completed", "created"}
        # trend_series has 30 items
        assert len(d["trend_series"]) == 30
        for tr in d["trend_series"]:
            assert set(tr.keys()) >= {"date", "cumulative"}
        # status_distribution has 3 items
        names = {x["name"] for x in d["status_distribution"]}
        assert names == {"Completed", "Pending", "Overdue"}
        # priority_distribution has 3 items
        pnames = {x["name"] for x in d["priority_distribution"]}
        assert pnames == {"High", "Medium", "Low"}
        assert isinstance(d["recent_activity"], list) and len(d["recent_activity"]) <= 10
        assert isinstance(d["insights"], list)

    def test_overdue_only_pending(self, ahmed_tok):
        """A task completed today with a past due_date must NOT be counted as overdue."""
        past = (date.today() - timedelta(days=5)).isoformat()
        r = requests.post(f"{API}/tasks", headers=_h(ahmed_tok),
                          json={"title": "TEST_past_but_done", "status": "completed", "due_date": past}, timeout=15)
        assert r.status_code == 200
        assert r.json()["overdue"] is False
        a = requests.get(f"{API}/tasks/analytics", headers=_h(ahmed_tok), timeout=20).json()
        # Still exactly 1 overdue (the pending one)
        assert a["totals"]["overdue"] == 1


# ---------------- Isolation ----------------
class TestIsolation:
    def test_users_lists_are_independent(self, nora_tok, ahmed_tok):
        n = requests.get(f"{API}/tasks", headers=_h(nora_tok), timeout=15).json()
        a = requests.get(f"{API}/tasks", headers=_h(ahmed_tok), timeout=15).json()
        n_ids = {x["id"] for x in n}
        a_ids = {x["id"] for x in a}
        assert n_ids.isdisjoint(a_ids)

    def test_analytics_independent(self, nora_tok, ahmed_tok):
        na = requests.get(f"{API}/tasks/analytics", headers=_h(nora_tok), timeout=20).json()
        aa = requests.get(f"{API}/tasks/analytics", headers=_h(ahmed_tok), timeout=20).json()
        # ahmed has 3 total from prepare, nora may differ
        assert na["totals"]["total"] != aa["totals"]["total"] or na["totals"]["completed"] != aa["totals"]["completed"]

    def test_cannot_patch_or_delete_other_users_task(self, nora_tok, ahmed_tok):
        # find one of ahmed's tasks
        a = requests.get(f"{API}/tasks", headers=_h(ahmed_tok), timeout=15).json()
        assert a, "expected ahmed to have tasks"
        tid = a[0]["id"]
        # nora tries to PATCH -> 404
        p = requests.patch(f"{API}/tasks/{tid}", headers=_h(nora_tok), json={"title": "hack"}, timeout=15)
        assert p.status_code == 404
        # nora tries to DELETE -> 404
        d = requests.delete(f"{API}/tasks/{tid}", headers=_h(nora_tok), timeout=15)
        assert d.status_code == 404


# ---------------- Regression: existing endpoints still work ----------------
class TestRegression:
    def test_health(self):
        assert requests.get(f"{API}/", timeout=10).status_code == 200

    def test_me_stats_admin(self, admin_tok):
        r = requests.get(f"{API}/me/stats", headers=_h(admin_tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_conversations", "total_messages", "memory_count"]:
            assert k in d

    def test_memory_get(self, admin_tok):
        r = requests.get(f"{API}/memory", headers=_h(admin_tok), timeout=15)
        assert r.status_code == 200
        assert "facts" in r.json()


# ---------------- Final cleanup ----------------
def test_zzz_cleanup(nora_tok, ahmed_tok):
    _cleanup_user_tasks(nora_tok)
    _cleanup_user_tasks(ahmed_tok)
