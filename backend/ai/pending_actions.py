"""Pending-action lifecycle for AI write capabilities.

Any capability with `side_effect == "write"` MUST route through this module.
Flow:

  chat -> executor sees write cap -> `create()` records a pending_action
       -> stream emits action_pending event -> frontend renders card
       -> user clicks Confirm -> `confirm()` transitions pending -> executed
       -> user clicks Cancel  -> `cancel()`  transitions pending -> cancelled

Idempotency:
  All state transitions use `find_one_and_update` with a `status: pending`
  filter, so a double-click / retry / duplicate submit can never execute the
  underlying capability twice.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .capabilities import ROLE_LEVEL, get as get_capability

logger = logging.getLogger("workmate.ai.pending_actions")


FRIENDLY_LABELS = {
    "create_leave_request": "Submit leave request",
    "create_it_ticket": "Open IT ticket",
    "update_task_status": "Update task status",
    "assign_task": "Re-assign task",
    "archive_project": "Archive project",
    "delete_project": "Delete project",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def missing_required_args(cap, args: Dict[str, Any]) -> List[str]:
    missing: List[str] = []
    for name, spec in (cap.args_schema or {}).items():
        if not spec.get("required"):
            continue
        v = args.get(name) if isinstance(args, dict) else None
        if v is None or (isinstance(v, str) and not v.strip()):
            missing.append(name)
    return missing


def build_preview(cap, args: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "capability": cap.name,
        "label": FRIENDLY_LABELS.get(cap.name, cap.name.replace("_", " ").title()),
        "category": cap.category,
        "side_effect": cap.side_effect,
        "args": args,
        "missing": missing_required_args(cap, args),
    }


async def create(db, user: Dict[str, Any], cap, args: Dict[str, Any],
                 conversation_id: Optional[str] = None) -> Dict[str, Any]:
    doc = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "user_id": user["id"],
        "company_id": user["company_id"],
        "user_role": user.get("role"),
        "capability_name": cap.name,
        "category": cap.category,
        "args": args or {},
        "preview": build_preview(cap, args or {}),
        "status": "pending",
        "created_at": _now(),
        "resolved_at": None,
        "result": None,
        "error": None,
    }
    await db.pending_actions.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def get_one(db, pa_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch a pending action the caller is allowed to see.
    Requester must be owner (created it) OR an admin/owner in the same workspace.
    Managers can see everything in their workspace to unblock approvals later.
    """
    pa = await db.pending_actions.find_one({"id": pa_id, "company_id": user["company_id"]},
                                           {"_id": 0})
    if not pa:
        raise HTTPException(404, "Pending action not found")
    lvl = ROLE_LEVEL.get(user.get("role") or "employee", 0)
    if pa["user_id"] != user["id"] and lvl < ROLE_LEVEL["manager"]:
        raise HTTPException(403, "Not permitted to view this action")
    return pa


async def list_recent(db, user: Dict[str, Any], conversation_id: Optional[str] = None,
                      limit: int = 30) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"company_id": user["company_id"], "user_id": user["id"]}
    if conversation_id:
        q["conversation_id"] = conversation_id
    return await db.pending_actions.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


async def _log_transition(db, pa: Dict[str, Any], user: Dict[str, Any],
                          phase: str, success: bool, error: Optional[str] = None,
                          latency_ms: int = 0, result_summary: Optional[str] = None):
    """Write a row into ai_tool_calls so audit is in one place."""
    try:
        await db.ai_tool_calls.insert_one({
            "id": str(uuid.uuid4()),
            "conversation_id": pa.get("conversation_id"),
            "company_id": pa["company_id"],
            "user_id": user["id"],
            "user_role": user.get("role"),
            "name": pa["capability_name"],
            "category": pa.get("category"),
            "side_effect": "write",
            "args": pa.get("args"),
            "phase": phase,            # confirmation_requested | confirmed_executed | cancelled | failed
            "pending_action_id": pa["id"],
            "success": success,
            "error": error,
            "latency_ms": latency_ms,
            "result_summary": result_summary,
            "created_at": _now(),
        })
    except Exception:
        logger.exception("failed to log pending-action transition")


async def cancel(db, pa_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    # Atomic: only cancels if still pending. Owner-only cancel.
    updated = await db.pending_actions.find_one_and_update(
        {"id": pa_id, "company_id": user["company_id"], "user_id": user["id"], "status": "pending"},
        {"$set": {"status": "cancelled", "resolved_at": _now()}},
        return_document=True,
    )
    if updated is None:
        # Distinguish "already resolved" from "not found / not owner"
        pa = await db.pending_actions.find_one({"id": pa_id, "company_id": user["company_id"]})
        if pa and pa["user_id"] != user["id"]:
            raise HTTPException(403, "Not permitted")
        if pa and pa["status"] != "pending":
            raise HTTPException(409, f"Action already {pa['status']}")
        raise HTTPException(404, "Pending action not found")
    updated.pop("_id", None)
    await _log_transition(db, updated, user, phase="cancelled", success=True)
    return updated


async def confirm(db, pa_id: str, user: Dict[str, Any],
                  edited_args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    # Step 1 — atomically claim the transition pending -> confirmed.
    claimed = await db.pending_actions.find_one_and_update(
        {"id": pa_id, "company_id": user["company_id"], "user_id": user["id"], "status": "pending"},
        {"$set": {"status": "confirmed", "resolved_at": _now()}},
        return_document=True,
    )
    if claimed is None:
        pa = await db.pending_actions.find_one({"id": pa_id, "company_id": user["company_id"]},
                                               {"_id": 0})
        if pa and pa["user_id"] != user["id"]:
            raise HTTPException(403, "Not permitted")
        if pa and pa["status"] == "executed":
            # Idempotent: already-executed confirmation returns the same result.
            return pa
        if pa and pa["status"] in ("cancelled", "failed"):
            raise HTTPException(409, f"Action was {pa['status']}, cannot confirm")
        raise HTTPException(404, "Pending action not found")

    claimed.pop("_id", None)
    cap = get_capability(claimed["capability_name"])
    if cap is None:
        await db.pending_actions.update_one(
            {"id": pa_id}, {"$set": {"status": "failed", "error": "unknown capability",
                                     "resolved_at": _now()}})
        await _log_transition(db, claimed, user, phase="failed", success=False,
                              error="unknown capability")
        raise HTTPException(500, "Capability no longer available")

    # Step 2 — defense-in-depth role check.
    lvl = ROLE_LEVEL.get(user.get("role") or "employee", 0)
    if lvl < ROLE_LEVEL[cap.min_role]:
        await db.pending_actions.update_one(
            {"id": pa_id}, {"$set": {"status": "failed", "error": "forbidden",
                                     "resolved_at": _now()}})
        await _log_transition(db, claimed, user, phase="failed", success=False, error="forbidden")
        raise HTTPException(403, f"'{cap.name}' requires role '{cap.min_role}'")

    # Step 3 — apply user edits (whitelisted to declared arg keys only).
    args = dict(claimed.get("args") or {})
    if isinstance(edited_args, dict):
        allowed = set((cap.args_schema or {}).keys())
        for k, v in edited_args.items():
            if k in allowed:
                args[k] = v
        # persist edited args so audit reflects what actually ran
        await db.pending_actions.update_one({"id": pa_id}, {"$set": {"args": args}})

    # Step 4 — execute the underlying capability handler (SAME code path as read caps).
    import time
    t0 = time.perf_counter()
    try:
        result = await cap.handler(args, user, db)
    except Exception as e:
        latency = int((time.perf_counter() - t0) * 1000)
        err = f"{e.__class__.__name__}: {e}"
        await db.pending_actions.update_one(
            {"id": pa_id}, {"$set": {"status": "failed", "error": err,
                                     "resolved_at": _now()}})
        await _log_transition(db, claimed, user, phase="failed", success=False,
                              error=err, latency_ms=latency)
        logger.exception(f"capability {cap.name} raised during confirmation")
        raise HTTPException(500, err)

    latency = int((time.perf_counter() - t0) * 1000)
    # If the handler itself signalled a validation error, mark failed but return 200
    # so the frontend can show the message inline instead of a hard error.
    is_error = isinstance(result, dict) and (result.get("error") or result.get("ok") is False)
    final_status = "failed" if is_error else "executed"
    await db.pending_actions.update_one(
        {"id": pa_id},
        {"$set": {"status": final_status, "result": result, "error": (result.get("error") if is_error else None),
                  "resolved_at": _now()}},
    )
    await _log_transition(
        db, claimed, user,
        phase="confirmed_executed" if not is_error else "failed",
        success=not is_error,
        error=result.get("error") if is_error else None,
        latency_ms=latency,
        result_summary=str(result)[:240],
    )
    fresh = await db.pending_actions.find_one({"id": pa_id}, {"_id": 0})
    return fresh
