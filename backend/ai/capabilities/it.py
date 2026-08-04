"""IT capabilities — create ticket, check status, search IT docs."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from . import Capability, register
from .knowledge import _search_documents_impl

try:
    import requests as _requests
except Exception:  # pragma: no cover
    _requests = None

N8N_IT_WEBHOOK = os.environ.get("N8N_IT_WEBHOOK", "https://danyah.app.n8n.cloud/webhook/it-support")

VALID_CATEGORIES = {"hardware", "software", "access", "network", "email", "security", "other"}
VALID_PRIORITY = {"low", "medium", "high", "urgent"}


async def _create_ticket(args: Dict[str, Any], user: Dict[str, Any], db):
    subject = (args.get("subject") or "").strip()
    description = (args.get("description") or "").strip()
    category = (args.get("category") or "other").strip().lower()
    priority = (args.get("priority") or "medium").strip().lower()
    if not subject:
        return {"error": "subject is required"}
    if not description:
        return {"error": "description is required"}
    if category not in VALID_CATEGORIES:
        category = "other"
    if priority not in VALID_PRIORITY:
        priority = "medium"

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "user_id": user["id"],
        "employee_name": user.get("name"),
        "employee_email": user.get("email"),
        "subject": subject,
        "description": description,
        "category": category,
        "priority": priority,
        "status": "open",
        "created_at": now,
    }
    await db.it_tickets.insert_one(doc)
    webhook_status = None
    if _requests is not None:
        try:
            r = _requests.post(N8N_IT_WEBHOOK, json={
                "id": doc["id"], "employee": doc["employee_name"], "email": doc["employee_email"],
                "subject": subject, "description": description, "category": category, "priority": priority,
            }, timeout=4)
            webhook_status = r.status_code
        except Exception as e:
            webhook_status = f"error: {e.__class__.__name__}"
    return {
        "ok": True,
        "ticket_id": doc["id"],
        "status": doc["status"],
        "summary": f"IT ticket opened [{priority}/{category}]: {subject}",
        "webhook_status": webhook_status,
    }


async def _check_ticket_status(args: Dict[str, Any], user: Dict[str, Any], db):
    ticket_id = (args.get("ticket_id") or "").strip()
    q = {"company_id": user["company_id"]}
    # Employees can only see their own tickets.
    from . import ROLE_LEVEL
    if ROLE_LEVEL.get(user.get("role", "employee"), 0) < ROLE_LEVEL["manager"]:
        q["user_id"] = user["id"]
    if ticket_id:
        q["id"] = ticket_id
        rec = await db.it_tickets.find_one(q, {"_id": 0})
        return {"result": rec} if rec else {"result": None, "note": "No matching ticket for this user"}
    rows = await db.it_tickets.find(q, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {"results": rows, "count": len(rows)}


async def _search_it_docs(args, user, db):
    q = (args.get("query") or "").strip() or "IT support"
    return await _search_documents_impl(user, db, q, filename_filter=r"it|helpdesk|support|password|vpn|network|security|access")


register(Capability(
    name="create_it_ticket",
    description="Open an IT support ticket on behalf of the current user. Include a clear subject and description.",
    args_schema={
        "subject": {"type": "string", "required": True, "description": "Short summary"},
        "description": {"type": "string", "required": True, "description": "Full description of the issue"},
        "category": {"type": "string", "required": False, "description": "hardware | software | access | network | email | security | other"},
        "priority": {"type": "string", "required": False, "description": "low | medium | high | urgent"},
    },
    handler=_create_ticket, category="it", side_effect="write",
))
register(Capability(
    name="check_ticket_status",
    description="Look up IT ticket status. With ticket_id returns one ticket; otherwise lists the current user's recent tickets.",
    args_schema={"ticket_id": {"type": "string", "required": False, "description": "Ticket ID"}},
    handler=_check_ticket_status, category="it",
))
register(Capability(
    name="search_it_documentation",
    description="Search IT / security / support documentation for how to do things (VPN, password reset, access, etc.).",
    args_schema={"query": {"type": "string", "required": True, "description": "What to look up"}},
    handler=_search_it_docs, category="it",
))
