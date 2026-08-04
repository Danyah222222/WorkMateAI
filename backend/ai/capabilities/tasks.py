"""Task capabilities — search, assigned, overdue, completed."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict

from . import Capability, register, ROLE_LEVEL


def _rx(q: str):
    return {"$regex": re.escape(q), "$options": "i"}


def _scope(user):
    """Employees only see their own tasks; managers+ see all workspace tasks."""
    base = {"company_id": user["company_id"]}
    if ROLE_LEVEL.get(user.get("role", "employee"), 0) < ROLE_LEVEL["manager"]:
        base["$or"] = [{"user_id": user["id"]}, {"assigned_to": user["id"]}]
    return base


def _trim(rows):
    for r in rows:
        r.pop("_id", None)
        r.pop("company_id", None)
    return rows


async def _search_tasks(args: Dict[str, Any], user, db):
    q = (args.get("query") or "").strip()
    status = args.get("status")
    mongo_q = _scope(user)
    if q:
        mongo_q["$and"] = [{"$or": [{"title": _rx(q)}, {"description": _rx(q)}, {"project": _rx(q)}]}]
    if status:
        mongo_q["status"] = status
    rows = await db.tasks.find(mongo_q, {"_id": 0}).sort("created_at", -1).limit(30).to_list(30)
    return {"results": _trim(rows), "count": len(rows)}


async def _my_tasks(args, user, db):
    status = args.get("status")
    mongo_q = {"company_id": user["company_id"],
               "$or": [{"user_id": user["id"]}, {"assigned_to": user["id"]}]}
    if status:
        mongo_q["status"] = status
    rows = await db.tasks.find(mongo_q, {"_id": 0}).sort("due_date", 1).limit(50).to_list(50)
    return {"results": _trim(rows), "count": len(rows)}


async def _overdue(args, user, db):
    today = datetime.now(timezone.utc).date().isoformat()
    mongo_q = _scope(user)
    mongo_q["status"] = {"$ne": "completed"}
    mongo_q["due_date"] = {"$lt": today, "$ne": None}
    rows = await db.tasks.find(mongo_q, {"_id": 0}).sort("due_date", 1).limit(50).to_list(50)
    return {"results": _trim(rows), "count": len(rows), "today": today}


async def _completed(args, user, db):
    limit = int(args.get("limit") or 20)
    mongo_q = _scope(user)
    mongo_q["status"] = "completed"
    rows = await db.tasks.find(mongo_q, {"_id": 0}).sort("updated_at", -1).limit(min(limit, 100)).to_list(100)
    return {"results": _trim(rows), "count": len(rows)}


register(Capability(
    name="search_tasks",
    description="Search tasks in the current workspace (scoped: employees see their own, managers see all).",
    args_schema={
        "query": {"type": "string", "required": False, "description": "Free-text query"},
        "status": {"type": "string", "required": False, "description": "pending | completed"},
    },
    handler=_search_tasks, category="tasks",
))
register(Capability(
    name="my_tasks",
    description="List tasks assigned to or owned by the current user.",
    args_schema={"status": {"type": "string", "required": False, "description": "pending | completed"}},
    handler=_my_tasks, category="tasks",
))
register(Capability(
    name="overdue_tasks",
    description="List tasks with a due date in the past that are not completed.",
    args_schema={},
    handler=_overdue, category="tasks",
))
register(Capability(
    name="completed_tasks",
    description="List recently completed tasks.",
    args_schema={"limit": {"type": "integer", "required": False, "description": "Max items (default 20)"}},
    handler=_completed, category="tasks",
))
