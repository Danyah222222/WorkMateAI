"""Capability planner.

Given a user message + the catalog of capabilities the user is allowed to call,
ask a small model (Haiku) to return a JSON plan of 0-3 capability invocations.

The planner is deliberately conservative — for greetings, chit-chat, meta
questions, or purely conversational messages it returns `{"calls": []}` so
we don't waste calls or embarrass the system with irrelevant lookups.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from .capabilities import catalog_for_prompt, available_for

logger = logging.getLogger("workmate.ai.planner")

PLANNER_MODEL = ("anthropic", "claude-haiku-4-5-20251001")

MAX_CALLS = 3

_SYSTEM = (
    "You are the CAPABILITY PLANNER for an enterprise assistant. "
    "You do not answer the user; you only decide which server-side capabilities "
    "should be called to gather the data required to answer.\n\n"
    "RULES:\n"
    "1. Only call capabilities when the user is asking for concrete workplace data "
    "(people, documents, projects, tasks, HR/IT actions).\n"
    "2. For greetings, small talk, opinions, meta-questions, or general chit-chat, "
    "return {\"calls\": []}.\n"
    "3. Call at most 3 capabilities. Prefer the smallest set that answers the question.\n"
    "4. Use ONLY capability names from the catalog. Match argument names exactly.\n"
    "5. Do NOT invent capabilities that aren't listed.\n"
    "6. NEVER return anything except a single JSON object.\n\n"
    "OUTPUT FORMAT (strict JSON, nothing else):\n"
    "{\"calls\": [ {\"name\": \"<capability_name>\", \"args\": { ... }} ] }"
)


async def make_plan(message: str, user: Dict[str, Any], recent_history: str = "") -> Dict[str, Any]:
    """Return {'calls': [...]} for the given message. Never raises."""
    if not (message or "").strip():
        return {"calls": []}
    catalog = catalog_for_prompt(user)
    if not available_for(user):
        return {"calls": []}

    prompt = (
        f"CATALOG:\n{catalog}\n\n"
        f"USER ROLE: {user.get('role')}\n"
        + (f"RECENT CONTEXT (for reference only, do not cite):\n{recent_history}\n\n" if recent_history else "")
        + f"USER MESSAGE:\n{message.strip()}\n\n"
        "Return JSON only."
    )

    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"planner-{user['id']}",
            system_message=_SYSTEM,
        ).with_model(*PLANNER_MODEL)
        parts: List[str] = []
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                parts.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        raw = "".join(parts).strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return {"calls": []}
        data = json.loads(m.group(0))
        calls = data.get("calls") or []
        if not isinstance(calls, list):
            return {"calls": []}
        # sanitize each call
        cleaned = []
        for c in calls[:MAX_CALLS]:
            if not isinstance(c, dict):
                continue
            n = c.get("name")
            a = c.get("args") or {}
            if isinstance(n, str) and isinstance(a, dict):
                cleaned.append({"name": n, "args": a})
        return {"calls": cleaned}
    except Exception:
        logger.exception("planner failed")
        return {"calls": []}
