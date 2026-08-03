"""
End-to-end backend tests for WorkMate AI User Account Management (iteration 11).
Covers: password policy, register/accept-invite, forgot/reset password, change-password,
profile fields, email change request/verify/cancel, activity log entries, rate-limiter presence.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback used only for local dev; CI/prod must supply env.
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@technova.com"
ADMIN_PASSWORD = "admin123"
EMPLOYEE_EMAIL = "sarah@technova.com"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- password policy on /auth/register ----------
class TestRegisterPasswordPolicy:
    def _reg(self, pw, email=None):
        return requests.post(f"{API}/auth/register", json={
            "workspace_name": f"TEST_ws_{uuid.uuid4().hex[:6]}",
            "name": "Test User",
            "email": email or f"TEST_{uuid.uuid4().hex[:8]}@example.com",
            "password": pw,
        })

    def test_too_short(self):
        r = self._reg("abc123")
        assert r.status_code == 400
        assert "at least 8" in r.json().get("detail", "").lower()

    def test_missing_letter(self):
        r = self._reg("12345678")
        assert r.status_code == 400
        assert "letter" in r.json().get("detail", "").lower()

    def test_missing_number(self):
        r = self._reg("abcdefgh")
        assert r.status_code == 400
        assert "number" in r.json().get("detail", "").lower()

    def test_valid_register(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = self._reg("Test1234", email=email)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and "user" in data
        assert data["user"]["email"].lower() == email.lower()
        # Cleanup: remove this test user
        try:
            token = data["access_token"]
            # No delete-account endpoint; leave user (workspace prefix TEST_ for identification)
        except Exception:
            pass


# ---------- accept-invite enforces strength ----------
class TestAcceptInvitePolicy:
    def test_accept_invite_weak_password_rejected(self, admin_headers):
        # Create an invite via admin
        invite_email = f"TEST_inv_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/invites", json={"email": invite_email, "role": "employee", "name": "Inv User"},
                          headers=admin_headers)
        if r.status_code == 404:
            pytest.skip("Invites endpoint not present in this build")
        assert r.status_code in (200, 201), r.text
        token = r.json().get("token") or r.json().get("invite", {}).get("token")
        if not token:
            pytest.skip("Invite token not returned by API")
        r2 = requests.post(f"{API}/auth/accept-invite", json={
            "token": token, "name": "Inv User", "password": "abc12"
        })
        assert r2.status_code == 400
        assert "8" in r2.json().get("detail", "")


# ---------- forgot / reset password ----------
class TestForgotResetPassword:
    def test_forgot_known_email_returns_dev_token(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("email_sent") is False
        assert isinstance(data.get("dev_token"), str) and len(data["dev_token"]) > 8
        pytest.shared_reset_token = data["dev_token"]

    def test_forgot_unknown_email_no_enumeration(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nobody-xyz@nowhere.example"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("email_sent") is False
        assert data.get("dev_token") is None

    def test_reset_password_weak_rejected(self):
        tok = getattr(pytest, "shared_reset_token", None)
        assert tok, "prev test must set reset token"
        r = requests.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "weakpw"})
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")

    def test_reset_password_missing_digit(self):
        tok = getattr(pytest, "shared_reset_token", None)
        r = requests.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "abcdefgh"})
        assert r.status_code == 400
        assert "number" in r.json().get("detail", "").lower()

    def test_reset_password_success_and_single_use(self):
        tok = getattr(pytest, "shared_reset_token", None)
        r = requests.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "Reset1234"})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Reuse -> 400
        r2 = requests.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "Reset1234"})
        assert r2.status_code == 400
        assert "invalid" in r2.json().get("detail", "").lower() or "already" in r2.json().get("detail", "").lower()

    def test_login_with_new_password_and_restore(self):
        # Login using new password
        r = _login(ADMIN_EMAIL, "Reset1234")
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        # Restore back to admin123 via change-password
        r2 = requests.post(f"{API}/auth/change-password",
                           json={"current_password": "Reset1234", "new_password": ADMIN_PASSWORD},
                           headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200, r2.text
        # Verify original password works
        r3 = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r3.status_code == 200


# ---------- change-password ----------
class TestChangePassword:
    def test_wrong_current_password(self, admin_headers):
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": "WRONG_current", "new_password": "NewPass123"},
                          headers=admin_headers)
        assert r.status_code == 401
        assert "current password" in r.json().get("detail", "").lower()

    def test_weak_new_password(self, admin_headers):
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": ADMIN_PASSWORD, "new_password": "abc"},
                          headers=admin_headers)
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")

    def test_success_then_restore_and_activity(self, admin_headers):
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": ADMIN_PASSWORD, "new_password": "Temp1234"},
                          headers=admin_headers)
        assert r.status_code == 200
        # activity has password_changed
        n = requests.get(f"{API}/notifications", headers=admin_headers)
        assert n.status_code == 200
        assert any(it.get("type") == "password_changed" for it in n.json().get("items", []))
        # restore
        # Need to re-login because token still valid, just call again
        r2 = requests.post(f"{API}/auth/change-password",
                           json={"current_password": "Temp1234", "new_password": ADMIN_PASSWORD},
                           headers=admin_headers)
        assert r2.status_code == 200


# ---------- profile fields ----------
class TestProfileFields:
    def test_profile_has_expected_fields(self, admin_headers):
        r = requests.get(f"{API}/profile", headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        for k in ["id", "email", "name", "role", "company_id", "workspace_name",
                  "created_at", "email_delivery_enabled"]:
            assert k in p, f"missing field: {k}"
        assert isinstance(p["email_delivery_enabled"], bool)
        # No pending email change at this point
        assert "pending_email" not in p or p.get("pending_email") in (None, "")


# ---------- email change flow ----------
class TestEmailChangeFlow:
    def test_wrong_current_password(self, admin_headers):
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": "somenew@example.com", "current_password": "WRONG"},
                          headers=admin_headers)
        assert r.status_code == 401

    def test_same_email_rejected(self, admin_headers):
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": ADMIN_EMAIL, "current_password": ADMIN_PASSWORD},
                          headers=admin_headers)
        assert r.status_code == 400
        assert "already your current" in r.json().get("detail", "").lower()

    def test_conflict_existing_email(self, admin_headers):
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": EMPLOYEE_EMAIL, "current_password": ADMIN_PASSWORD},
                          headers=admin_headers)
        assert r.status_code == 409
        assert "in use" in r.json().get("detail", "").lower()

    def test_request_success_and_pending(self, admin_headers):
        new_email = f"admin+e2e_{uuid.uuid4().hex[:5]}@technova.com"
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": new_email, "current_password": ADMIN_PASSWORD},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("pending_email") == new_email
        assert data.get("email_sent") is False
        assert isinstance(data.get("dev_token"), str)
        pytest.shared_email_token = data["dev_token"]
        pytest.shared_new_email = new_email
        # profile now shows pending_email
        p = requests.get(f"{API}/profile", headers=admin_headers).json()
        assert p.get("pending_email") == new_email

    def test_second_request_invalidates_first(self, admin_headers):
        prev_token = pytest.shared_email_token
        new2 = f"admin+e2e2_{uuid.uuid4().hex[:5]}@technova.com"
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": new2, "current_password": ADMIN_PASSWORD},
                          headers=admin_headers)
        assert r.status_code == 200
        # first token can no longer be used for verify
        r2 = requests.post(f"{API}/profile/email/verify", json={"token": prev_token})
        assert r2.status_code == 400
        pytest.shared_email_token = r.json()["dev_token"]
        pytest.shared_new_email = new2

    def test_verify_garbage_token(self):
        r = requests.post(f"{API}/profile/email/verify", json={"token": "garbage-nonsense"})
        assert r.status_code == 400

    def test_verify_success_and_reuse_blocked(self, admin_headers):
        tok = pytest.shared_email_token
        new_email = pytest.shared_new_email
        r = requests.post(f"{API}/profile/email/verify", json={"token": tok})
        assert r.status_code == 200, r.text
        assert r.json().get("new_email") == new_email
        # old email login fails, new works
        assert _login(ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 401
        r2 = _login(new_email, ADMIN_PASSWORD)
        assert r2.status_code == 200
        new_token = r2.json()["access_token"]
        new_headers = {"Authorization": f"Bearer {new_token}"}
        # reuse verify
        r3 = requests.post(f"{API}/profile/email/verify", json={"token": tok})
        assert r3.status_code == 400
        # activity log has entries
        n = requests.get(f"{API}/notifications", headers=new_headers).json()
        types = {it.get("type") for it in n.get("items", [])}
        assert "email_change_requested" in types
        assert "email_changed" in types
        # revert email back to admin@technova.com
        r4 = requests.post(f"{API}/profile/email/request-change",
                           json={"new_email": ADMIN_EMAIL, "current_password": ADMIN_PASSWORD},
                           headers=new_headers)
        assert r4.status_code == 200
        revert_tok = r4.json()["dev_token"]
        r5 = requests.post(f"{API}/profile/email/verify", json={"token": revert_tok})
        assert r5.status_code == 200
        # ensure admin email is restored
        assert _login(ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 200

    def test_cancel_pending(self, admin_headers):
        # request another change then cancel
        newe = f"admin+cancel_{uuid.uuid4().hex[:5]}@technova.com"
        r = requests.post(f"{API}/profile/email/request-change",
                          json={"new_email": newe, "current_password": ADMIN_PASSWORD},
                          headers=admin_headers)
        assert r.status_code == 200
        p = requests.get(f"{API}/profile", headers=admin_headers).json()
        assert p.get("pending_email") == newe
        r2 = requests.post(f"{API}/profile/email/cancel-change", headers=admin_headers)
        assert r2.status_code == 200
        p2 = requests.get(f"{API}/profile", headers=admin_headers).json()
        assert not p2.get("pending_email")


# ---------- rate limit spot check ----------
class TestRateLimitSpotCheck:
    def test_forgot_password_rate_limited(self):
        """5/hour — 6 rapid calls should include at least one 429."""
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/forgot-password", json={"email": "ratelimit-test@example.com"})
            codes.append(r.status_code)
        assert 429 in codes, f"expected 429 among {codes}"


# ---------- regression: employee login still works ----------
class TestRegressionEmployeeLogin:
    def test_sarah_login(self):
        r = _login("sarah@technova.com", "employee123")
        assert r.status_code == 200
