"""HR capabilities — create leave request, look up HR content."""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from . import Capability, register
from .knowledge import _search_documents_impl

# n8n webhook (kept from existing code). We POST to it but do NOT depend
# on its response — the request is persisted locally so status lookups work.
try:
    import requests as _requests
except Exception:  # pragma: no cover
    _requests = None

N8N_LEAVE_WEBHOOK = os.environ.get("N8N_LEAVE_WEBHOOK", "https://danyah.app.n8n.cloud/webhook/leave-request")


def _iso_ok(s: str) -> bool:
    return bool(s and re.match(r"^\d{4}-\d{2}-\d{2}$", s))


async def _create_leave(args: Dict[str, Any], user: Dict[str, Any], db):
    start = (args.get("start_date") or "").strip()
    end = (args.get("end_date") or "").strip()
    leave_type = (args.get("type") or "vacation").strip().lower()
    reason = (args.get("reason") or "").strip()
    if not _iso_ok(start) or not _iso_ok(end):
        return {"error": "start_date and end_date must be YYYY-MM-DD"}
    if end < start:
        return {"error": "end_date must not be earlier than start_date"}
    if leave_type not in {"vacation", "sick", "personal", "unpaid", "bereavement"}:
        leave_type = "vacation"

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "user_id": user["id"],
        "employee_name": user.get("name"),
        "employee_email": user.get("email"),
        "type": leave_type,
        "start_date": start,
        "end_date": end,
        "reason": reason,
        "status": "submitted",
        "created_at": now,
    }
    await db.leave_requests.insert_one(doc)
    # Fire-and-forget notification to n8n; failures don't break the flow.
    webhook_status = None
    if _requests is not None:
        try:
            r = _requests.post(N8N_LEAVE_WEBHOOK, json={
                "id": doc["id"], "employee": doc["employee_name"], "email": doc["employee_email"],
                "type": leave_type, "start_date": start, "end_date": end, "reason": reason,
            }, timeout=4)
            webhook_status = r.status_code
        except Exception as e:
            webhook_status = f"error: {e.__class__.__name__}"
    return {
        "ok": True,
        "leave_request_id": doc["id"],
        "status": doc["status"],
        "summary": f"Submitted {leave_type} leave from {start} to {end}",
        "webhook_status": webhook_status,
    }


async def _check_leave_policy(args, user, db):
    q = (args.get("query") or "leave policy").strip()
    return await _search_documents_impl(user, db, q, filename_filter=r"leave|vacation|pto|policy|handbook|hr")


async def _explain_hr_procedure(args, user, db):
    q = (args.get("topic") or "").strip() or "hr procedure"
    return await _search_documents_impl(user, db, q, filename_filter=r"hr|handbook|policy|procedure|benefit|onboard|payroll")


async def _list_my_leave(args, user, db):
    rows = await db.leave_requests.find(
        {"company_id": user["company_id"], "user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(20).to_list(20)
    return {"results": rows, "count": len(rows)}


register(Capability(
    name="create_leave_request",
    description=(
        "Submit a leave request for the current user. Requires start_date and end_date "
        "in YYYY-MM-DD format. Confirm the dates with the user before calling."
    ),
    args_schema={
        "start_date": {"type": "string", "required": True, "description": "YYYY-MM-DD"},
        "end_date": {"type": "string", "required": True, "description": "YYYY-MM-DD"},
        "type": {"type": "string", "required": False, "description": "vacation | sick | personal | unpaid | bereavement"},
        "reason": {"type": "string", "required": False, "description": "Short reason"},
    },
    handler=_create_leave, category="hr", side_effect="write",
))
register(Capability(
    name="check_leave_policy",
    description="Search HR/leave policy documents for how leave, PTO, or vacation is handled.",
    args_schema={"query": {"type": "string", "required": False, "description": "Leave-related question"}},
    handler=_check_leave_policy, category="hr",
))
register(Capability(
    name="explain_hr_procedure",
    description="Find HR procedures (onboarding, benefits, payroll, expenses, handbook) in company documents.",
    args_schema={"topic": {"type": "string", "required": True, "description": "HR topic to look up"}},
    handler=_explain_hr_procedure, category="hr",
))
register(Capability(
    name="list_my_leave_requests",
    description="List the current user's own submitted leave requests and their status.",
    args_schema={},
    handler=_list_my_leave, category="hr",
))
