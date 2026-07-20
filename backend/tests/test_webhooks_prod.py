"""
Webhook production URL verification tests.
Verifies:
- /api/webhooks/leave-request forwards to PRODUCTION n8n URL with correct payload
- /api/webhooks/it-support forwards to PRODUCTION n8n URL with correct payload
- Both endpoints require authentication
- No `/webhook-test/` string remains in server.py
- Regression: health, login, /auth/me, /employees, /documents, /settings, /feedback
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # fallback: read frontend .env directly
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break

ADMIN_EMAIL = "admin@technova.com"
ADMIN_PASS = "admin123"
EMP_EMAIL = "sarah@technova.com"
EMP_PASS = "employee123"

EXPECTED_LEAVE_PAYLOAD = {
    "employee": "Ahmed Ali",
    "department": "Engineering",
    "request": "Vacation",
    "dates": "August 1 - August 5",
}
EXPECTED_IT_PAYLOAD = {
    "employee": "Ahmed Ali",
    "department": "Engineering",
    "issue": "Laptop won't connect to Wi-Fi",
    "priority": "Medium",
}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def emp_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMP_EMAIL, "password": EMP_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------- Source-level verification ----------
class TestSourceCode:
    def test_no_webhook_test_url_in_server(self):
        with open('/app/backend/server.py') as f:
            src = f.read()
        assert '/webhook-test/' not in src, "Found /webhook-test/ still present in server.py"

    def test_production_urls_present(self):
        with open('/app/backend/server.py') as f:
            src = f.read()
        assert 'https://danyah.app.n8n.cloud/webhook/leave-request' in src
        assert 'https://danyah.app.n8n.cloud/webhook/it-support' in src


# ---------- Health ----------
class TestHealth:
    def test_root_health(self, s):
        r = s.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("service") == "WorkMate AI"
        assert data.get("status") == "ok"


# ---------- Auth regression ----------
class TestAuthRegression:
    def test_admin_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["access_token"]

    def test_employee_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMP_EMAIL, "password": EMP_PASS}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "employee"

    def test_auth_me(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Webhook auth requirement ----------
class TestWebhookAuth:
    def test_leave_without_auth(self, s):
        r = s.post(f"{BASE_URL}/api/webhooks/leave-request", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"

    def test_it_without_auth(self, s):
        r = s.post(f"{BASE_URL}/api/webhooks/it-support", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"


# ---------- Webhook production URL + payload ----------
class TestWebhookProdRouting:
    def test_leave_payload_correct(self, s, emp_token):
        r = s.post(
            f"{BASE_URL}/api/webhooks/leave-request",
            headers={"Authorization": f"Bearer {emp_token}"},
            timeout=30,
        )
        # We accept 200 (forwarded successfully OR forwarded with n8n 404 wrapped in 200 by our proxy)
        assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
        data = r.json()
        assert "payload_sent" in data
        assert data["payload_sent"] == EXPECTED_LEAVE_PAYLOAD
        # status_code and ok fields should exist
        assert "status_code" in data
        assert "ok" in data
        # If n8n replied "test mode" text we should NOT see it — check the raw response text
        blob = str(data.get("response", "")).lower()
        assert "in test mode" not in blob and "listen for test event" not in blob, (
            f"Response indicates test URL still used: {data.get('response')}"
        )

    def test_it_payload_correct(self, s, emp_token):
        r = s.post(
            f"{BASE_URL}/api/webhooks/it-support",
            headers={"Authorization": f"Bearer {emp_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
        data = r.json()
        assert "payload_sent" in data
        assert data["payload_sent"] == EXPECTED_IT_PAYLOAD
        blob = str(data.get("response", "")).lower()
        assert "in test mode" not in blob and "listen for test event" not in blob


# ---------- Regression on other endpoints ----------
class TestOtherRegression:
    def test_employees_seed(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/employees", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        emps = r.json()
        assert isinstance(emps, list)
        assert len(emps) >= 4
        emails = {e["email"] for e in emps}
        for expected in ["sarah@technova.com", "ahmed@technova.com", "nora@technova.com", "khalid@technova.com"]:
            assert expected in emails

    def test_documents_seed(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/documents", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 4
        names = {d["filename"] for d in docs}
        for n in ["employees.csv", "remote_work_policy.pdf", "leave_policy.pdf", "it_security_guidelines.pdf"]:
            assert n in names

    def test_settings_get_and_put(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/settings", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        current = r.json()
        # Put with same-ish values (restore after)
        payload = {
            "assistant_name": current.get("assistant_name", "Nova"),
            "language": current.get("language", "en"),
            "personality": current.get("personality", "professional"),
        }
        r2 = s.put(f"{BASE_URL}/api/settings", headers={"Authorization": f"Bearer {admin_token}"}, json=payload, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["assistant_name"] == payload["assistant_name"]

    def test_feedback_stats(self, s, admin_token):
        r = s.get(f"{BASE_URL}/api/feedback/stats", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("up", "down", "total"):
            assert k in d

    def test_chat_stream_tokens(self, s, emp_token):
        r = s.post(
            f"{BASE_URL}/api/chat/stream",
            headers={"Authorization": f"Bearer {emp_token}"},
            json={"message": "Who is the HR manager?"},
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200
        got_delta = False
        got_done = False
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            if '"type": "delta"' in line or '"type":"delta"' in line:
                got_delta = True
            if '"type": "done"' in line or '"type":"done"' in line:
                got_done = True
                break
        assert got_delta, "No streaming delta received"
        assert got_done, "Never got done event"
