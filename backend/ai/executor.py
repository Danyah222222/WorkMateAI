"""Capability executor.

Runs a planner-produced call list under the authenticated user. Every
capability is executed by trusted server-side Python code:

  * company_id is taken from the *authenticated* user, never from the LLM
  * min_role is enforced by the registry
  * arguments are passed through the capability handler which is expected
    to validate them and never trust identity fields
  * WRITE capabilities never execute here — they create a pending_action
    row that the user must confirm via /api/ai/pending-actions/{id}/confirm

All calls are logged to `ai_tool_calls`.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from .capabilities import Capability, ROLE_LEVEL, get as get_capability
from . import pending_actions as pa_mod

logger = logging.getLogger("workmate.ai.executor")

MAX_CALLS_PER_TURN = 3


def _summarize(result: Any, limit: int = 240) -> str:
    try:
        s = json.dumps(result, default=str)
    except Exception:
        s = str(result)
    return s if len(s) <= limit else s[:limit] + "…"


async def execute_plan(
    plan: Dict[str, Any],
    user: Dict[str, Any],
    db,
    conversation_id: str = "",
) -> List[Dict[str, Any]]:
    """Return a list of {name, args, result, error?, latency_ms, pending_action?}."""
    calls = (plan or {}).get("calls") or []
    calls = calls[:MAX_CALLS_PER_TURN]
    out: List[Dict[str, Any]] = []

    for call in calls:
        name = call.get("name") if isinstance(call, dict) else None
        args = (call or {}).get("args") if isinstance(call, dict) else None
        if not isinstance(name, str) or not isinstance(args, dict):
            continue
        cap: Capability | None = get_capability(name)
        row: Dict[str, Any] = {"name": name, "args": args, "result": None,
                               "error": None, "latency_ms": 0, "pending_action": None}
        if cap is None:
            row["error"] = f"unknown capability: {name}"
            out.append(row)
            await _log(db, user, conversation_id, name, args, row, cap)
            continue
        # Role enforcement — never trust the model's chosen name to bypass this.
        user_lvl = ROLE_LEVEL.get(user.get("role") or "employee", 0)
        if user_lvl < ROLE_LEVEL[cap.min_role]:
            row["error"] = f"forbidden: '{name}' requires role '{cap.min_role}'"
            out.append(row)
            await _log(db, user, conversation_id, name, args, row, cap)
            continue

        # ============ WRITE CAPABILITY — create a pending action, DO NOT execute ============
        if cap.side_effect == "write":
            try:
                pa = await pa_mod.create(db, user, cap, args, conversation_id=conversation_id or None)
                row["pending_action"] = pa
                row["result"] = {
                    "status": "pending_confirmation",
                    "pending_action_id": pa["id"],
                    "preview": pa["preview"],
                    "note": "Confirmation required. Present the details to the user and wait for Confirm/Cancel.",
                }
                await pa_mod._log_transition(db, pa, user, phase="confirmation_requested",
                                             success=True)
            except Exception as e:
                logger.exception("failed to create pending_action")
                row["error"] = f"{e.__class__.__name__}: {e}"
                await _log(db, user, conversation_id, name, args, row, cap)
            out.append(row)
            continue

        # ============ READ CAPABILITY — execute immediately ============
        t0 = time.perf_counter()
        try:
            row["result"] = await cap.handler(args, user, db)
        except Exception as e:
            logger.exception(f"capability {name} raised")
            row["error"] = f"{e.__class__.__name__}: {e}"
        row["latency_ms"] = int((time.perf_counter() - t0) * 1000)
        out.append(row)
        await _log(db, user, conversation_id, name, args, row, cap)

    return out


async def _log(db, user, conversation_id, name, args, row, cap):
    try:
        await db.ai_tool_calls.insert_one({
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id or None,
            "company_id": user.get("company_id"),
            "user_id": user.get("id"),
            "user_role": user.get("role"),
            "name": name,
            "category": getattr(cap, "category", None),
            "side_effect": getattr(cap, "side_effect", "read"),
            "args": args,
            "phase": "executed" if not row.get("error") else "failed",
            "result_summary": _summarize(row.get("result")) if not row.get("error") else None,
            "error": row.get("error"),
            "success": not row.get("error"),
            "latency_ms": row.get("latency_ms", 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("failed to log ai_tool_call")


def format_for_prompt(rows: List[Dict[str, Any]], max_chars: int = 6000) -> str:
    """Compact string representation for the responder LLM."""
    if not rows:
        return "(no capabilities called)"
    parts: List[str] = []
    remaining = max_chars
    for r in rows:
        header = f"--- CAPABILITY: {r['name']}  args={json.dumps(r.get('args') or {}, default=str)}"
        if r.get("error"):
            body = f"ERROR: {r['error']}"
        else:
            try:
                body = json.dumps(r.get("result"), default=str, ensure_ascii=False, indent=2)
            except Exception:
                body = str(r.get("result"))
        block = f"{header}\n{body}"
        if len(block) > remaining:
            block = block[: max(0, remaining - 40)] + "\n… (truncated)"
        parts.append(block)
        remaining -= len(block)
        if remaining <= 0:
            break
    return "\n\n".join(parts)


def any_pending_action(rows: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    """Return the first pending_action produced this turn, if any."""
    for r in rows or []:
        pa = r.get("pending_action")
        if pa:
            return pa
    return None

