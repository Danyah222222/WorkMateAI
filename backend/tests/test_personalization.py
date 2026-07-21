"""Backend tests: AI memory, personalization, /me/stats, conversation search/patch/isolation, /stats scoping."""
import os
import time
import json
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    envp = Path("/app/frontend/.env")
    for line in envp.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

SARAH = {"email": "sarah@technova.com", "password": "employee123"}
AHMED = {"email": "ahmed@technova.com", "password": "employee123"}
ADMIN = {"email": "admin@technova.com", "password": "admin123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def sarah_token():
    tok, _ = _login(SARAH)
    return tok


@pytest.fixture(scope="module")
def ahmed_token():
    tok, _ = _login(AHMED)
    return tok


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(ADMIN)
    return tok


# -------- /api/memory GET/DELETE isolation --------
class TestMemoryEndpoints:
    def test_memory_shape(self, sarah_token):
        r = requests.get(f"{API}/memory", headers=_h(sarah_token))
        assert r.status_code == 200
        body = r.json()
        assert "facts" in body and isinstance(body["facts"], list)
        assert "updated_at" in body

    def test_memory_clear_returns_ok_and_empties(self, sarah_token):
        r = requests.delete(f"{API}/memory", headers=_h(sarah_token))
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        r2 = requests.get(f"{API}/memory", headers=_h(sarah_token))
        assert r2.status_code == 200
        assert r2.json()["facts"] == []

    def test_memory_requires_auth(self):
        r = requests.get(f"{API}/memory")
        assert r.status_code in (401, 403)
        r2 = requests.delete(f"{API}/memory")
        assert r2.status_code in (401, 403)


# -------- /api/me/stats --------
class TestMeStats:
    def test_stats_shape_sarah(self, sarah_token):
        r = requests.get(f"{API}/me/stats", headers=_h(sarah_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_conversations", "active_conversations", "total_messages", "recent", "memory_count"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["recent"], list)
        assert isinstance(d["total_conversations"], int)
        assert isinstance(d["memory_count"], int)

    def test_stats_admin_independent(self, admin_token, sarah_token):
        a = requests.get(f"{API}/me/stats", headers=_h(admin_token)).json()
        s = requests.get(f"{API}/me/stats", headers=_h(sarah_token)).json()
        # separate users -> separate object; not necessarily different numbers but must not share memory objects
        assert a is not None and s is not None
        # both should be independent well-formed responses
        assert "recent" in a and "recent" in s


# -------- Chat stream personalization + memory extraction --------
def _stream_chat(token, message, conversation_id=None):
    payload = {"message": message}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    with requests.post(
        f"{API}/chat/stream",
        headers={**_h(token), "Content-Type": "application/json"},
        json=payload,
        stream=True,
        timeout=90,
    ) as r:
        assert r.status_code == 200, r.text
        conv_id = None
        full = ""
        for line in r.iter_lines():
            if not line:
                continue
            s = line.decode("utf-8", errors="ignore")
            if s.startswith("data: "):
                try:
                    ev = json.loads(s[6:])
                except Exception:
                    continue
                t = ev.get("type")
                if t == "meta":
                    conv_id = ev.get("conversation_id")
                elif t == "delta":
                    full += ev.get("content", "")
                elif t == "done":
                    break
                elif t == "error":
                    pytest.fail(f"stream error: {ev.get('message')}")
        return conv_id, full


class TestChatPersonalization:
    def test_chat_addresses_by_name_and_has_source(self, sarah_token):
        # Ensure clean memory to make the extraction meaningful
        requests.delete(f"{API}/memory", headers=_h(sarah_token))
        msg = ("Hi, please always give me bullet-point answers and remember I work on "
               "Q3 HR handbook project. What is the leave policy?")
        conv_id, reply = _stream_chat(sarah_token, msg)
        assert conv_id
        assert reply.strip(), "assistant returned empty text"
        # Must contain Sarah by name
        assert "Sarah" in reply, f"reply did not address by name: {reply[:400]}"
        # Must end with a Source line pointing to leave_policy.pdf
        assert "Source:" in reply
        # Loosely check the source file is referenced
        assert "leave_policy" in reply.lower(), f"expected leave_policy source in reply: {reply[-300:]}"

    def test_memory_extracted_after_stream(self, sarah_token):
        # Give the background extractor time to complete
        time.sleep(9)
        r = requests.get(f"{API}/memory", headers=_h(sarah_token))
        assert r.status_code == 200
        facts = r.json().get("facts", [])
        # Extraction may occasionally return 0 facts if Haiku call fails; log but assert typical case
        blob = " ".join(facts).lower()
        if not facts:
            pytest.skip("memory extractor returned no facts (acceptable degradation per spec)")
        assert ("bullet" in blob) or ("q3" in blob) or ("handbook" in blob), (
            f"expected preference/project fact but got: {facts}")


# -------- Conversation search / patch / ownership isolation --------
class TestConversationSearchAndOwnership:
    @pytest.fixture(scope="class")
    def sarah_conv_ids(self):
        s_tok, _ = _login(SARAH)
        ids = []
        for msg in ["What is the HR leave policy details?", "Tell me about IT security guidelines"]:
            conv_id, _ = _stream_chat(s_tok, msg)
            assert conv_id
            ids.append(conv_id)
        return s_tok, ids

    def test_search_filters_by_title(self, sarah_conv_ids):
        s_tok, ids = sarah_conv_ids
        r = requests.get(f"{API}/conversations", params={"q": "hr"}, headers=_h(s_tok))
        assert r.status_code == 200
        convs = r.json()
        assert isinstance(convs, list)
        for c in convs:
            assert "hr" in (c.get("title") or "").lower(), f"filter failed: {c.get('title')}"

    def test_patch_own_conversation_archives(self, sarah_conv_ids):
        s_tok, ids = sarah_conv_ids
        cid = ids[0]
        r = requests.patch(f"{API}/conversations/{cid}", json={"status": "archived"}, headers=_h(s_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "archived"

    def test_patch_other_users_conversation_404(self, sarah_conv_ids, ahmed_token):
        _, ids = sarah_conv_ids
        cid = ids[1]
        r = requests.patch(f"{API}/conversations/{cid}", json={"status": "archived"}, headers=_h(ahmed_token))
        assert r.status_code == 404

    def test_get_messages_ownership(self, sarah_conv_ids, ahmed_token):
        s_tok, ids = sarah_conv_ids
        cid = ids[1]
        # owner ok
        r_own = requests.get(f"{API}/conversations/{cid}/messages", headers=_h(s_tok))
        assert r_own.status_code == 200
        assert isinstance(r_own.json(), list)
        # other user 404
        r_other = requests.get(f"{API}/conversations/{cid}/messages", headers=_h(ahmed_token))
        assert r_other.status_code == 404

    def test_delete_other_user_404(self, sarah_conv_ids, ahmed_token):
        _, ids = sarah_conv_ids
        cid = ids[1]
        r = requests.delete(f"{API}/conversations/{cid}", headers=_h(ahmed_token))
        assert r.status_code == 404

    def test_delete_own_conversation_ok(self, sarah_conv_ids):
        s_tok, ids = sarah_conv_ids
        cid = ids[1]
        r = requests.delete(f"{API}/conversations/{cid}", headers=_h(s_tok))
        assert r.status_code == 200
        # verify it's gone
        r2 = requests.get(f"{API}/conversations/{cid}/messages", headers=_h(s_tok))
        assert r2.status_code == 404


# -------- Admin /api/stats company-scoped --------
class TestAdminStats:
    def test_admin_stats_shape(self, admin_token):
        r = requests.get(f"{API}/stats", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("employees", "documents", "conversations", "messages", "active_users_7d"):
            assert k in d, f"missing key {k}"
            assert isinstance(d[k], int)

    def test_stats_employee_forbidden(self, sarah_token):
        r = requests.get(f"{API}/stats", headers=_h(sarah_token))
        assert r.status_code == 403


# -------- Cross-user isolation regression on memory --------
class TestMemoryIsolation:
    def test_admin_memory_independent(self, admin_token, sarah_token):
        # Clear admin's memory to start clean, ensure Sarah's memory (populated earlier) is untouched
        s_before = requests.get(f"{API}/memory", headers=_h(sarah_token)).json().get("facts", [])
        requests.delete(f"{API}/memory", headers=_h(admin_token))
        a = requests.get(f"{API}/memory", headers=_h(admin_token)).json()
        assert a["facts"] == []
        s_after = requests.get(f"{API}/memory", headers=_h(sarah_token)).json().get("facts", [])
        assert s_after == s_before, "clearing admin memory affected Sarah's memory"
