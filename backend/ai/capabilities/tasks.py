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


# ---------------- Write capabilities (require confirmation) ----------------
_TASK_STATUSES = {"pending", "completed"}
_KANBAN_STATUSES = {"backlog", "todo", "in_progress", "review", "done"}


async def _update_task_status(args: Dict[str, Any], user, db):
    task_id = (args.get("task_id") or "").strip()
    new_status = (args.get("status") or "").strip().lower() or None
    new_kanban = (args.get("kanban_status") or "").strip().lower() or None
    if not task_id:
        return {"ok": False, "error": "task_id is required"}
    if not new_status and not new_kanban:
        return {"ok": False, "error": "provide status ('pending'|'completed') or kanban_status"}
    task = await db.tasks.find_one({"id": task_id, "company_id": user["company_id"]})
    if not task:
        return {"ok": False, "error": "Task not found"}
    # Employees can only touch their own tasks
    if ROLE_LEVEL.get(user.get("role", "employee"), 0) < ROLE_LEVEL["manager"]:
        if task.get("user_id") != user["id"] and task.get("assigned_to") != user["id"]:
            return {"ok": False, "error": "You can only update tasks assigned to you"}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if new_status:
        if new_status not in _TASK_STATUSES:
            return {"ok": False, "error": f"Invalid status. Use one of: {sorted(_TASK_STATUSES)}"}
        updates["status"] = new_status
        # Keep kanban in sync when task is marked completed / uncompleted
        if new_status == "completed":
            updates["kanban_status"] = "done"
        elif new_status == "pending" and task.get("kanban_status") == "done":
            updates["kanban_status"] = "in_progress"
    if new_kanban:
        if new_kanban not in _KANBAN_STATUSES:
            return {"ok": False, "error": f"Invalid kanban_status. Use one of: {sorted(_KANBAN_STATUSES)}"}
        updates["kanban_status"] = new_kanban
        updates["status"] = "completed" if new_kanban == "done" else "pending"
    await db.tasks.update_one(
        {"id": task_id, "company_id": user["company_id"]},
        {"$set": updates},
    )
    return {"ok": True, "task_id": task_id, "changes": updates,
            "summary": f"Task '{task.get('title')}' updated"}


async def _assign_task(args: Dict[str, Any], user, db):
    task_id = (args.get("task_id") or "").strip()
    ident = (args.get("assignee") or args.get("email") or "").strip().lower()
    if not task_id or not ident:
        return {"ok": False, "error": "task_id and assignee (email or user id) are required"}
    task = await db.tasks.find_one({"id": task_id, "company_id": user["company_id"]})
    if not task:
        return {"ok": False, "error": "Task not found"}
    # Assignment is a management action — managers+ only.
    if ROLE_LEVEL.get(user.get("role", "employee"), 0) < ROLE_LEVEL["manager"]:
        return {"ok": False, "error": "Only managers and above can reassign tasks"}
    # Resolve assignee — accept email or user id, must be in same workspace
    target = await db.users.find_one(
        {"company_id": user["company_id"],
         "$or": [{"email": ident}, {"id": ident}]},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    )
    if not target:
        return {"ok": False, "error": f"No workspace member matches '{ident}'"}
    await db.tasks.update_one(
        {"id": task_id, "company_id": user["company_id"]},
        {"$set": {"assigned_to": target["id"],
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "task_id": task_id, "assigned_to": target["id"],
            "assignee_email": target["email"], "assignee_name": target["name"],
            "summary": f"Task assigned to {target['name']}"}


register(Capability(
    name="update_task_status",
    description=(
        "Mark a task as completed or pending, or move it to a kanban column. "
        "Employees can only update tasks assigned to them; managers can update any."
    ),
    args_schema={
        "task_id": {"type": "string", "required": True, "description": "Task ID"},
        "status": {"type": "string", "required": False, "description": "pending | completed"},
        "kanban_status": {"type": "string", "required": False, "description": "backlog | todo | in_progress | review | done"},
    },
    handler=_update_task_status, category="tasks", side_effect="write",
))
register(Capability(
    name="assign_task",
    description="Assign a task to a workspace member (by email or user id). Manager or higher only.",
    args_schema={
        "task_id": {"type": "string", "required": True, "description": "Task ID"},
        "assignee": {"type": "string", "required": True, "description": "Assignee email or user id"},
    },
    handler=_assign_task, category="tasks", side_effect="write", min_role="manager",
))
