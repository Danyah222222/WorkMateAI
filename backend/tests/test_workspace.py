"""
Multi-tenant workspace / invitations / RBAC / team tests for WorkMate AI SaaS
Ordered end-to-end; uses BASE_URL from REACT_APP_BACKEND_URL.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    fe_env = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    for line in open(fe_env).read().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

# Seeded TechNova credentials
TECHNOVA = {
    "owner": ("admin@technova.com", "admin123"),
    "manager_sarah": ("sarah@technova.com", "employee123"),
    "manager_khalid": ("khalid@technova.com", "employee123"),
    "employee_ahmed": ("ahmed@technova.com", "employee123"),
    "employee_nora": ("nora@technova.com", "employee123"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- REGISTER + ROLE MIGRATION ----------------
class TestRegistrationAndMigration:
    def test_register_creates_workspace_and_owner(self):
        rand = uuid.uuid4().hex[:8]
        payload = {
            "workspace_name": f"TEST_WS_{rand}",
            "name": f"Owner {rand}",
            "email": f"TEST_owner_{rand}@example.com",
            "password": "secret123",
        }
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and body["user"]["role"] == "owner"
        assert body["user"]["workspace_name"] == payload["workspace_name"]
        # duplicate email -> 409
        r2 = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r2.status_code == 409, r2.text
        pytest.owner_token = body["access_token"]
        pytest.owner_user = body["user"]

    def test_role_migration(self):
        for email, pw in TECHNOVA.values():
            data = _login(email, pw)
            me = requests.get(f"{API}/auth/me", headers=_auth(data["access_token"]), timeout=15)
            assert me.status_code == 200
            role = me.json()["role"]
            if email == "admin@technova.com":
                assert role == "owner", f"admin@ expected owner, got {role}"
            elif email in ("sarah@technova.com", "khalid@technova.com"):
                assert role == "manager", f"{email} expected manager, got {role}"
            else:
                assert role == "employee", f"{email} expected employee, got {role}"
            assert me.json().get("workspace_name") == "TechNova"


# ---------------- WORKSPACE ISOLATION ----------------
class TestIsolation:
    def test_two_workspaces_are_isolated(self):
        rand = uuid.uuid4().hex[:8]
        acme_payload = {
            "workspace_name": f"TEST_Acme_{rand}", "name": "Acme Owner",
            "email": f"TEST_acme_{rand}@example.com", "password": "acmepass1",
        }
        globex_payload = {
            "workspace_name": f"TEST_Globex_{rand}", "name": "Globex Owner",
            "email": f"TEST_globex_{rand}@example.com", "password": "globexpass1",
        }
        r_a = requests.post(f"{API}/auth/register", json=acme_payload, timeout=15)
        r_g = requests.post(f"{API}/auth/register", json=globex_payload, timeout=15)
        assert r_a.status_code == 200 and r_g.status_code == 200
        t_a, t_g = r_a.json()["access_token"], r_g.json()["access_token"]

        # Each owner creates ONE task
        ra = requests.post(f"{API}/tasks", json={"title": f"TEST_task_acme_{rand}"}, headers=_auth(t_a))
        rg = requests.post(f"{API}/tasks", json={"title": f"TEST_task_globex_{rand}"}, headers=_auth(t_g))
        assert ra.status_code == 200 and rg.status_code == 200
        acme_task_id = ra.json()["id"]

        # Each owner sees ONLY their own task
        la = requests.get(f"{API}/tasks", headers=_auth(t_a)).json()
        lg = requests.get(f"{API}/tasks", headers=_auth(t_g)).json()
        assert any(t["id"] == acme_task_id for t in la)
        assert not any(t["id"] == acme_task_id for t in lg)
        assert not any(t["id"] == rg.json()["id"] for t in la)

        # Team scoping
        ta = requests.get(f"{API}/team", headers=_auth(t_a)).json()
        tg = requests.get(f"{API}/team", headers=_auth(t_g)).json()
        assert len(ta) == 1 and ta[0]["email"] == acme_payload["email"].lower()
        assert len(tg) == 1 and tg[0]["email"] == globex_payload["email"].lower()

        # Cross-workspace PATCH/DELETE on task -> 404
        cross = requests.delete(f"{API}/tasks/{acme_task_id}", headers=_auth(t_g))
        assert cross.status_code == 404


# ---------------- INVITATIONS ----------------
class TestInvitations:
    @classmethod
    def setup_class(cls):
        cls.owner_token = _login(*TECHNOVA["owner"])["access_token"]
        cls.rand = uuid.uuid4().hex[:8]
        cls.invitee_email = f"TEST_newhire_{cls.rand}@technova.com".lower()

    def test_create_invitation_success(self):
        r = requests.post(f"{API}/invitations",
                          json={"email": self.invitee_email, "role": "employee"},
                          headers=_auth(self.owner_token))
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] == "pending" and inv["token"] and inv["role"] == "employee"
        assert inv["workspace_id"] == inv["company_id"]
        pytest.tn_invite = inv

    def test_duplicate_pending_invite_conflict(self):
        r = requests.post(f"{API}/invitations",
                          json={"email": self.invitee_email, "role": "employee"},
                          headers=_auth(self.owner_token))
        assert r.status_code == 409

    def test_existing_member_conflict(self):
        r = requests.post(f"{API}/invitations",
                          json={"email": "sarah@technova.com", "role": "employee"},
                          headers=_auth(self.owner_token))
        assert r.status_code == 409

    def test_list_only_this_workspace(self):
        r = requests.get(f"{API}/invitations", headers=_auth(self.owner_token))
        assert r.status_code == 200
        emails = [i["email"] for i in r.json()]
        assert self.invitee_email in emails

    def test_lookup_and_accept(self):
        token = pytest.tn_invite["token"]
        # Lookup should NOT require auth
        r = requests.get(f"{API}/invitations/lookup/{token}", timeout=15)
        assert r.status_code == 200, r.text
        info = r.json()
        assert info["email"] == self.invitee_email
        assert info["workspace_name"] == "TechNova"

        # Accept
        r2 = requests.post(f"{API}/auth/accept-invite", json={
            "token": token, "name": "New Hire", "password": "hire1234",
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        user = r2.json()["user"]
        assert user["email"] == self.invitee_email
        assert user["role"] == "employee"
        # Second use -> 400
        r3 = requests.post(f"{API}/auth/accept-invite", json={
            "token": token, "name": "New Hire", "password": "hire1234",
        }, timeout=15)
        assert r3.status_code == 400

    def test_resend_and_cancel(self):
        # Create fresh invite
        email2 = f"TEST_resend_{uuid.uuid4().hex[:6]}@technova.com"
        r = requests.post(f"{API}/invitations",
                          json={"email": email2, "role": "employee"},
                          headers=_auth(self.owner_token))
        assert r.status_code == 200
        inv = r.json()
        old_expires = inv["expires_at"]
        time.sleep(1.2)
        # Resend
        rr = requests.post(f"{API}/invitations/{inv['id']}/resend",
                           headers=_auth(self.owner_token))
        assert rr.status_code == 200
        # verify expires_at bumped
        lst = requests.get(f"{API}/invitations", headers=_auth(self.owner_token)).json()
        updated = next(i for i in lst if i["id"] == inv["id"])
        assert updated["expires_at"] > old_expires
        # Cancel
        rc = requests.delete(f"{API}/invitations/{inv['id']}", headers=_auth(self.owner_token))
        assert rc.status_code == 200
        lst2 = requests.get(f"{API}/invitations", headers=_auth(self.owner_token)).json()
        cancelled = next(i for i in lst2 if i["id"] == inv["id"])
        assert cancelled["status"] == "cancelled"
        # Resend on cancelled -> 400
        rr2 = requests.post(f"{API}/invitations/{inv['id']}/resend",
                            headers=_auth(self.owner_token))
        assert rr2.status_code == 400


# ---------------- RBAC ----------------
class TestRBAC:
    @classmethod
    def setup_class(cls):
        cls.owner_token = _login(*TECHNOVA["owner"])["access_token"]
        cls.manager_token = _login(*TECHNOVA["manager_sarah"])["access_token"]
        cls.employee_token = _login(*TECHNOVA["employee_nora"])["access_token"]

    def test_employee_cannot_invite(self):
        r = requests.post(f"{API}/invitations",
                          json={"email": f"TEST_rbac_{uuid.uuid4().hex[:6]}@example.com", "role": "employee"},
                          headers=_auth(self.employee_token))
        assert r.status_code == 403

    def test_manager_cannot_invite_per_spec(self):
        # require_admin allows only owner+admin. Manager should be 403.
        r = requests.post(f"{API}/invitations",
                          json={"email": f"TEST_mgr_{uuid.uuid4().hex[:6]}@example.com", "role": "employee"},
                          headers=_auth(self.manager_token))
        assert r.status_code == 403

    def test_employee_cannot_delete_member(self):
        # find some member id from team list
        team = requests.get(f"{API}/team", headers=_auth(self.owner_token)).json()
        some_id = next(m["id"] for m in team if m["email"] == "ahmed@technova.com")
        r = requests.delete(f"{API}/team/{some_id}", headers=_auth(self.employee_token))
        assert r.status_code == 403

    def test_employee_cannot_change_role(self):
        team = requests.get(f"{API}/team", headers=_auth(self.owner_token)).json()
        some_id = next(m["id"] for m in team if m["email"] == "ahmed@technova.com")
        r = requests.patch(f"{API}/team/{some_id}/role",
                           json={"role": "manager"}, headers=_auth(self.employee_token))
        assert r.status_code == 403

    def test_manager_cannot_change_role(self):
        team = requests.get(f"{API}/team", headers=_auth(self.owner_token)).json()
        some_id = next(m["id"] for m in team if m["email"] == "ahmed@technova.com")
        r = requests.patch(f"{API}/team/{some_id}/role",
                           json={"role": "manager"}, headers=_auth(self.manager_token))
        assert r.status_code == 403

    def test_owner_can_change_role(self):
        team = requests.get(f"{API}/team", headers=_auth(self.owner_token)).json()
        ahmed_id = next(m["id"] for m in team if m["email"] == "ahmed@technova.com")
        # Ahmed's original role is 'employee'. Bump to manager then back.
        r = requests.patch(f"{API}/team/{ahmed_id}/role",
                           json={"role": "manager"}, headers=_auth(self.owner_token))
        assert r.status_code == 200 and r.json()["role"] == "manager"
        # revert
        r2 = requests.patch(f"{API}/team/{ahmed_id}/role",
                            json={"role": "employee"}, headers=_auth(self.owner_token))
        assert r2.status_code == 200 and r2.json()["role"] == "employee"


# ---------------- TEAM ----------------
class TestTeam:
    def test_team_returns_stats(self):
        tok = _login(*TECHNOVA["owner"])["access_token"]
        r = requests.get(f"{API}/team", headers=_auth(tok))
        assert r.status_code == 200
        for m in r.json():
            assert set(m["stats"].keys()) == {"total_tasks", "pending", "completed", "overdue"}
            for v in m["stats"].values():
                assert isinstance(v, int)

    def test_team_delete_cross_workspace_404(self):
        # Create a fresh workspace + owner, then try to delete a TechNova user
        rand = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/auth/register", json={
            "workspace_name": f"TEST_Iso_{rand}",
            "name": "Iso Owner",
            "email": f"TEST_iso_{rand}@example.com",
            "password": "isopass1",
        })
        assert r.status_code == 200
        outside_tok = r.json()["access_token"]
        # Look up TechNova nora id using an owner in TechNova
        tn_tok = _login(*TECHNOVA["owner"])["access_token"]
        nora_id = next(m["id"] for m in requests.get(f"{API}/team", headers=_auth(tn_tok)).json()
                       if m["email"] == "nora@technova.com")
        r2 = requests.delete(f"{API}/team/{nora_id}", headers=_auth(outside_tok))
        assert r2.status_code == 404


# ---------------- REGRESSION ----------------
class TestRegression:
    @classmethod
    def setup_class(cls):
        cls.owner_token = _login(*TECHNOVA["owner"])["access_token"]
        cls.emp_token = _login(*TECHNOVA["employee_ahmed"])["access_token"]

    def test_auth_me_carries_workspace(self):
        r = requests.get(f"{API}/auth/me", headers=_auth(self.owner_token))
        assert r.status_code == 200 and r.json()["workspace_name"] == "TechNova"

    def test_tasks_crud_regression(self):
        r = requests.post(f"{API}/tasks", json={"title": f"TEST_reg_{uuid.uuid4().hex[:6]}"},
                          headers=_auth(self.emp_token))
        assert r.status_code == 200
        tid = r.json()["id"]
        # list
        assert any(t["id"] == tid for t in requests.get(f"{API}/tasks", headers=_auth(self.emp_token)).json())
        # patch
        p = requests.patch(f"{API}/tasks/{tid}", json={"status": "completed"}, headers=_auth(self.emp_token))
        assert p.status_code == 200 and p.json()["status"] == "completed"
        # delete
        d = requests.delete(f"{API}/tasks/{tid}", headers=_auth(self.emp_token))
        assert d.status_code == 200

    def test_analytics_shape(self):
        r = requests.get(f"{API}/tasks/analytics", headers=_auth(self.emp_token))
        assert r.status_code == 200
        keys = r.json().keys()
        for k in ("totals", "weekly_series", "trend_series", "status_distribution", "priority_distribution", "insights"):
            assert k in keys

    def test_memory_and_stats(self):
        r = requests.get(f"{API}/memory", headers=_auth(self.emp_token))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/me/stats", headers=_auth(self.emp_token))
        assert r2.status_code == 200
        r3 = requests.get(f"{API}/stats", headers=_auth(self.owner_token))
        assert r3.status_code == 200

    def test_settings_employees_documents(self):
        assert requests.get(f"{API}/settings", headers=_auth(self.owner_token)).status_code == 200
        assert requests.get(f"{API}/employees", headers=_auth(self.owner_token)).status_code == 200
        assert requests.get(f"{API}/documents", headers=_auth(self.owner_token)).status_code == 200
        assert requests.get(f"{API}/feedback", headers=_auth(self.owner_token)).status_code == 200
