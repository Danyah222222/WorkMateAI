"""Backend tests: session persistence bug fix - login + /auth/me + wrong creds."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env
    from pathlib import Path
    envp = Path("/app/frontend/.env")
    for line in envp.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@technova.com", "password": "admin123"}
EMPLOYEE = {"email": "sarah@technova.com", "password": "employee123"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------- Health --------
def test_health(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# -------- Login --------
class TestLogin:
    def test_admin_login_returns_jwt_and_user(self, session):
        r = session.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == ADMIN["email"]
        assert data["user"]["role"] == "admin"
        assert "id" in data["user"] and "company_id" in data["user"]

    def test_employee_login_returns_jwt_and_user(self, session):
        r = session.post(f"{API}/auth/login", json=EMPLOYEE)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == EMPLOYEE["email"]
        assert data["user"]["role"] == "employee"

    def test_wrong_password_401(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")

    def test_unknown_email_401(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "nobody@technova.com", "password": "x"})
        assert r.status_code == 401


# -------- /auth/me (session persistence check) --------
class TestAuthMe:
    def test_me_with_admin_token(self, session):
        login = session.post(f"{API}/auth/login", json=ADMIN).json()
        token = login["access_token"]
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == ADMIN["email"]
        assert me["role"] == "admin"
        assert me["id"] == login["user"]["id"]

    def test_me_with_employee_token(self, session):
        login = session.post(f"{API}/auth/login", json=EMPLOYEE).json()
        token = login["access_token"]
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["email"] == EMPLOYEE["email"]

    def test_me_without_token_401_or_403(self, session):
        r = session.get(f"{API}/auth/me")
        # FastAPI HTTPBearer returns 403 when no creds, 401 when invalid
        assert r.status_code in (401, 403)

    def test_me_with_invalid_token_401(self, session):
        r = session.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert r.status_code == 401


# -------- Protected endpoints usable with token (session works across calls) --------
class TestProtectedEndpoints:
    @pytest.fixture(scope="class")
    def admin_token(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json=ADMIN)
        return r.json()["access_token"]

    @pytest.fixture(scope="class")
    def emp_token(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json=EMPLOYEE)
        return r.json()["access_token"]

    def test_documents(self, admin_token):
        r = requests.get(f"{API}/documents", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_employees(self, admin_token):
        r = requests.get(f"{API}/employees", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_settings(self, admin_token):
        r = requests.get(f"{API}/settings", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["assistant_name"]

    def test_automations(self, admin_token):
        r = requests.get(f"{API}/automations", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_stats_admin_only(self, admin_token, emp_token):
        # admin allowed
        r = requests.get(f"{API}/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        # employee forbidden
        r2 = requests.get(f"{API}/stats", headers={"Authorization": f"Bearer {emp_token}"})
        assert r2.status_code == 403

    def test_feedback_admin_only(self, admin_token, emp_token):
        r = requests.get(f"{API}/feedback", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        r2 = requests.get(f"{API}/feedback", headers={"Authorization": f"Bearer {emp_token}"})
        assert r2.status_code == 403

    def test_conversations_list(self, emp_token):
        r = requests.get(f"{API}/conversations", headers={"Authorization": f"Bearer {emp_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
