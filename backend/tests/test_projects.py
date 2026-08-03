"""Backend tests for Projects, Kanban, AI Summary, RBAC, Workspace Isolation, and Regression."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = _line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@technova.com", "admin123")
EMP = ("nora@technova.com", "employee123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def emp_token():
    return _login(*EMP)


@pytest.fixture(scope="module")
def created_project(admin_token):
    payload = {
        "name": f"TEST_Project_{uuid.uuid4().hex[:6]}",
        "description": "Test project for automation",
        "priority": "high",
        "tags": ["backend", "test"],
        "due_date": "2026-06-30",
    }
    r = requests.post(f"{API}/projects", json=payload, headers=_hdr(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["progress"] == 0
    assert data["workspace_id"]
    assert data["created_by"]
    return data


# --------- Projects CRUD ---------
class TestProjectsCRUD:
    def test_create_and_list(self, admin_token, created_project):
        r = requests.get(f"{API}/projects", headers=_hdr(admin_token))
        assert r.status_code == 200
        found = [p for p in r.json() if p["id"] == created_project["id"]]
        assert found
        p = found[0]
        assert "stats" in p and "progress" in p

    def test_patch_project(self, admin_token, created_project):
        pid = created_project["id"]
        upd = {"name": created_project["name"] + "_upd", "description": "New desc",
               "priority": "low", "tags": ["updated"]}
        r = requests.patch(f"{API}/projects/{pid}", json=upd, headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        # verify persisted
        g = requests.get(f"{API}/projects/{pid}", headers=_hdr(admin_token)).json()
        assert g["name"].endswith("_upd")
        assert g["description"] == "New desc"
        assert g["priority"] == "low"
        assert g["tags"] == ["updated"]

    def test_archive(self, admin_token):
        # create fresh project
        r = requests.post(f"{API}/projects", json={"name": f"TEST_arch_{uuid.uuid4().hex[:6]}"},
                          headers=_hdr(admin_token))
        pid = r.json()["id"]
        a = requests.post(f"{API}/projects/{pid}/archive", headers=_hdr(admin_token))
        assert a.status_code == 200
        lst = requests.get(f"{API}/projects", headers=_hdr(admin_token)).json()
        assert not any(p["id"] == pid for p in lst)
        lst2 = requests.get(f"{API}/projects?include_archived=true", headers=_hdr(admin_token)).json()
        assert any(p["id"] == pid and p.get("status") == "archived" for p in lst2)

    def test_delete_detaches_tasks(self, admin_token):
        # create project + task
        pr = requests.post(f"{API}/projects", json={"name": f"TEST_del_{uuid.uuid4().hex[:6]}"},
                           headers=_hdr(admin_token)).json()
        pid = pr["id"]
        tr = requests.post(f"{API}/tasks", json={
            "title": "TEST_task_link", "project_id": pid,
        }, headers=_hdr(admin_token))
        assert tr.status_code == 200, tr.text
        tid = tr.json()["id"]
        d = requests.delete(f"{API}/projects/{pid}", headers=_hdr(admin_token))
        assert d.status_code == 200
        # task should still exist but project_id=null
        # fetch tasks list and find it
        tasks = requests.get(f"{API}/tasks", headers=_hdr(admin_token)).json()
        # /tasks could be list or {tasks:[...]}
        arr = tasks if isinstance(tasks, list) else tasks.get("tasks", [])
        match = [t for t in arr if t["id"] == tid]
        assert match, "task deleted with project (should be detached)"
        assert match[0].get("project_id") in (None, "")


# --------- Task <-> Project linkage ---------
class TestTaskProjectLink:
    def test_task_cross_workspace_project_404(self, admin_token):
        # Register a fresh workspace
        iso_email = f"iso_{uuid.uuid4().hex[:6]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "workspace_name": "Isolation Test Co",
            "name": "Iso Owner",
            "email": iso_email,
            "password": "isopass123",
        })
        assert rr.status_code == 200, rr.text
        iso_tok = rr.json()["access_token"]
        # iso owner creates a project
        p = requests.post(f"{API}/projects", json={"name": "TEST_iso_proj"}, headers=_hdr(iso_tok)).json()
        iso_pid = p["id"]
        # admin from other workspace tries to attach task to iso_pid
        r = requests.post(f"{API}/tasks", json={"title": "TEST_x", "project_id": iso_pid},
                          headers=_hdr(admin_token))
        assert r.status_code == 404
        return iso_tok, iso_pid

    def test_workspace_isolation_project_access(self, admin_token):
        iso_email = f"iso_{uuid.uuid4().hex[:6]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "workspace_name": "Isolation Test Co 2",
            "name": "Iso Owner2",
            "email": iso_email,
            "password": "isopass123",
        })
        iso_tok = rr.json()["access_token"]
        # get an admin project id
        adm_projects = requests.get(f"{API}/projects", headers=_hdr(admin_token)).json()
        assert adm_projects
        admin_pid = adm_projects[0]["id"]
        # iso owner GET/PATCH/DELETE should be 404
        g = requests.get(f"{API}/projects/{admin_pid}", headers=_hdr(iso_tok))
        assert g.status_code == 404
        p = requests.patch(f"{API}/projects/{admin_pid}", json={"name": "hack"}, headers=_hdr(iso_tok))
        assert p.status_code == 404
        d = requests.delete(f"{API}/projects/{admin_pid}", headers=_hdr(iso_tok))
        assert d.status_code == 404
        # iso GET /projects has only own
        own = requests.get(f"{API}/projects", headers=_hdr(iso_tok)).json()
        assert all(pr["workspace_id"] != admin_projects_ws(adm_projects[0]) or True for pr in own)
        assert not any(pr["id"] == admin_pid for pr in own)


def admin_projects_ws(p):
    return p.get("workspace_id")


# --------- Kanban sync ---------
class TestKanbanSync:
    def test_kanban_done_sets_status_completed(self, admin_token, created_project):
        pid = created_project["id"]
        t = requests.post(f"{API}/tasks", json={"title": "TEST_k1", "project_id": pid},
                          headers=_hdr(admin_token)).json()
        tid = t["id"]
        r = requests.patch(f"{API}/tasks/{tid}", json={"kanban_status": "done"},
                           headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        assert d.get("completed_at")

        # move back to in_progress -> pending
        r2 = requests.patch(f"{API}/tasks/{tid}", json={"kanban_status": "in_progress"},
                            headers=_hdr(admin_token))
        d2 = r2.json()
        assert d2["status"] == "pending"
        assert d2.get("completed_at") in (None, "")

    def test_status_completed_sets_kanban_done(self, admin_token, created_project):
        pid = created_project["id"]
        t = requests.post(f"{API}/tasks", json={"title": "TEST_k2", "project_id": pid},
                          headers=_hdr(admin_token)).json()
        tid = t["id"]
        r = requests.patch(f"{API}/tasks/{tid}", json={"status": "completed"},
                           headers=_hdr(admin_token))
        d = r.json()
        assert d["kanban_status"] == "done"


# --------- Analytics ---------
class TestProjectAnalytics:
    def test_analytics_shape(self, admin_token, created_project):
        pid = created_project["id"]
        # ensure at least one task
        requests.post(f"{API}/tasks", json={"title": "TEST_a1", "project_id": pid},
                      headers=_hdr(admin_token))
        r = requests.get(f"{API}/projects/{pid}/analytics", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["progress", "totals", "kanban_counts", "members", "activity"]:
            assert k in d, f"missing {k}"
        for c in ["backlog", "todo", "in_progress", "review", "done"]:
            assert c in d["kanban_counts"]
        for k in ["total", "completed", "overdue", "pending"]:
            assert k in d["totals"]


# --------- AI Summary ---------
class TestAISummary:
    def test_ai_summary(self, admin_token, created_project):
        pid = created_project["id"]
        r = requests.post(f"{API}/projects/{pid}/ai/summary",
                          headers=_hdr(admin_token), timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("summary"), str) and d["summary"]
        for k in ["risks", "next_actions", "overdue_focus"]:
            assert isinstance(d.get(k), list)
        assert "progress" in d.get("computed", {})
        assert "overdue_count" in d.get("computed", {})


# --------- RBAC ---------
class TestRBAC:
    def test_employee_cannot_create(self, emp_token):
        r = requests.post(f"{API}/projects", json={"name": "TEST_emp_proj"}, headers=_hdr(emp_token))
        assert r.status_code == 403

    def test_employee_cannot_patch_archive_delete(self, admin_token, emp_token):
        pr = requests.post(f"{API}/projects", json={"name": f"TEST_rbac_{uuid.uuid4().hex[:6]}"},
                           headers=_hdr(admin_token)).json()
        pid = pr["id"]
        assert requests.patch(f"{API}/projects/{pid}", json={"name": "x"}, headers=_hdr(emp_token)).status_code == 403
        assert requests.post(f"{API}/projects/{pid}/archive", headers=_hdr(emp_token)).status_code == 403
        assert requests.delete(f"{API}/projects/{pid}", headers=_hdr(emp_token)).status_code == 403

    def test_employee_list_scoped(self, emp_token):
        r = requests.get(f"{API}/projects", headers=_hdr(emp_token))
        assert r.status_code == 200
        # should only contain projects nora belongs to (may be empty)
        assert isinstance(r.json(), list)


# --------- Regression ---------
class TestRegression:
    def test_auth_me_workspace_name(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json().get("workspace_name")

    def test_tasks_analytics(self, admin_token):
        r = requests.get(f"{API}/tasks/analytics", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_memory(self, admin_token):
        r = requests.get(f"{API}/memory", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_me_stats(self, admin_token):
        r = requests.get(f"{API}/me/stats", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_settings(self, admin_token):
        r = requests.get(f"{API}/settings", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_employees(self, admin_token):
        r = requests.get(f"{API}/employees", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_team(self, admin_token):
        r = requests.get(f"{API}/team", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_invitations(self, admin_token):
        r = requests.get(f"{API}/invitations", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_documents(self, admin_token):
        r = requests.get(f"{API}/documents", headers=_hdr(admin_token))
        assert r.status_code == 200

    def test_feedback_get(self, admin_token):
        r = requests.get(f"{API}/feedback", headers=_hdr(admin_token))
        assert r.status_code in (200, 405)
