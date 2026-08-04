"""Project capabilities — search projects, members, deadlines, milestones."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict

from . import Capability, register


def _rx(q: str):
    return {"$regex": re.escape(q), "$options": "i"}


async def _search_projects(args: Dict[str, Any], user: Dict[str, Any], db):
    q = (args.get("query") or "").strip()
    status = args.get("status")
    mongo_q: Dict[str, Any] = {"company_id": user["company_id"]}
    if q:
        mongo_q["$or"] = [{"name": _rx(q)}, {"description": _rx(q)}, {"tags": _rx(q)}]
    if status:
        mongo_q["status"] = status
    rows = await db.projects.find(mongo_q, {"_id": 0}).sort("updated_at", -1).limit(20).to_list(20)
    # trim heavy fields
    for r in rows:
        r.pop("kanban_columns", None)
    return {"results": rows, "count": len(rows)}


async def _project_members(args: Dict[str, Any], user: Dict[str, Any], db):
    q = (args.get("project") or "").strip()
    if not q:
        return {"results": [], "error": "project name is required"}
    proj = await db.projects.find_one(
        {"company_id": user["company_id"], "name": _rx(q)},
        {"_id": 0},
    )
    if not proj:
        return {"results": [], "count": 0, "note": f"No project matching '{q}'"}
    member_ids = proj.get("assigned_members") or []
    members = []
    if member_ids:
        rows = await db.users.find(
            {"id": {"$in": member_ids}, "company_id": user["company_id"]},
            {"_id": 0, "password_hash": 0, "avatar": 0},
        ).to_list(200)
        members = rows
    return {
        "project": {"id": proj.get("id"), "name": proj.get("name"), "status": proj.get("status")},
        "results": members, "count": len(members),
    }


async def _project_deadlines(args: Dict[str, Any], user: Dict[str, Any], db):
    """Upcoming (or overdue) project deadlines. Optional 'within_days'."""
    within = args.get("within_days")
    mongo_q: Dict[str, Any] = {"company_id": user["company_id"], "due_date": {"$ne": None}}
    rows = await db.projects.find(
        mongo_q, {"_id": 0, "id": 1, "name": 1, "status": 1, "due_date": 1, "priority": 1},
    ).sort("due_date", 1).to_list(50)
    today = datetime.now(timezone.utc).date().isoformat()
    enriched = []
    for r in rows:
        if not r.get("due_date"):
            continue
        r["is_overdue"] = r["due_date"] < today and r.get("status") not in ("completed", "archived")
        enriched.append(r)
    if isinstance(within, int) and within > 0:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc).date() + timedelta(days=within)).isoformat()
        enriched = [r for r in enriched if r["due_date"] <= cutoff]
    return {"results": enriched, "count": len(enriched), "today": today}


async def _project_milestones(args: Dict[str, Any], user: Dict[str, Any], db):
    """We treat high-priority tasks in a project as its milestones."""
    q = (args.get("project") or "").strip()
    if not q:
        return {"results": [], "error": "project name is required"}
    proj = await db.projects.find_one(
        {"company_id": user["company_id"], "name": _rx(q)}, {"_id": 0, "id": 1, "name": 1},
    )
    if not proj:
        return {"results": [], "count": 0, "note": f"No project matching '{q}'"}
    tasks = await db.tasks.find(
        {"company_id": user["company_id"], "project_id": proj["id"], "priority": "high"},
        {"_id": 0, "id": 1, "title": 1, "status": 1, "kanban_status": 1, "due_date": 1, "assigned_to": 1},
    ).sort("due_date", 1).to_list(50)
    return {"project": proj, "results": tasks, "count": len(tasks)}


register(Capability(
    name="search_projects",
    description="Search projects by name, description, tags or status.",
    args_schema={
        "query": {"type": "string", "required": False, "description": "Free-text query"},
        "status": {"type": "string", "required": False, "description": "One of: planning, active, on_hold, completed, archived"},
    },
    handler=_search_projects, category="projects",
))
register(Capability(
    name="list_project_members",
    description="List the members assigned to a given project.",
    args_schema={"project": {"type": "string", "required": True, "description": "Project name or partial name"}},
    handler=_project_members, category="projects",
))
register(Capability(
    name="list_project_deadlines",
    description="List upcoming and overdue project deadlines across the workspace.",
    args_schema={"within_days": {"type": "integer", "required": False, "description": "Only projects due within N days"}},
    handler=_project_deadlines, category="projects",
))
register(Capability(
    name="list_project_milestones",
    description="List a project's high-priority tasks as milestones.",
    args_schema={"project": {"type": "string", "required": True, "description": "Project name"}},
    handler=_project_milestones, category="projects",
))


# ---------------- Write capabilities (require confirmation) ----------------
async def _archive_project(args: Dict[str, Any], user, db):
    pid = (args.get("project_id") or "").strip()
    name = (args.get("project") or "").strip()
    q: Dict[str, Any] = {"company_id": user["company_id"]}
    if pid:
        q["id"] = pid
    elif name:
        q["name"] = _rx(name)
    else:
        return {"ok": False, "error": "project_id or project name is required"}
    proj = await db.projects.find_one(q)
    if not proj:
        return {"ok": False, "error": "Project not found"}
    if proj.get("status") == "archived":
        return {"ok": False, "error": "Project is already archived"}
    await db.projects.update_one(
        {"id": proj["id"], "company_id": user["company_id"]},
        {"$set": {"status": "archived", "archived_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "project_id": proj["id"], "name": proj.get("name"),
            "summary": f"Project '{proj.get('name')}' archived"}


async def _delete_project(args: Dict[str, Any], user, db):
    pid = (args.get("project_id") or "").strip()
    name = (args.get("project") or "").strip()
    q: Dict[str, Any] = {"company_id": user["company_id"]}
    if pid:
        q["id"] = pid
    elif name:
        q["name"] = _rx(name)
    else:
        return {"ok": False, "error": "project_id or project name is required"}
    proj = await db.projects.find_one(q)
    if not proj:
        return {"ok": False, "error": "Project not found"}
    # Detach tasks (mirror existing delete_project endpoint behavior)
    await db.tasks.update_many(
        {"project_id": proj["id"], "company_id": user["company_id"]},
        {"$set": {"project_id": None, "project": None}},
    )
    await db.projects.delete_one({"id": proj["id"], "company_id": user["company_id"]})
    return {"ok": True, "project_id": proj["id"], "name": proj.get("name"),
            "summary": f"Project '{proj.get('name')}' deleted"}


# ROLE_LEVEL is imported implicitly via capabilities base; import here for clarity
from . import ROLE_LEVEL  # noqa: E402

register(Capability(
    name="archive_project",
    description="Archive a project so it stops appearing in active work views. Manager or higher only.",
    args_schema={
        "project_id": {"type": "string", "required": False, "description": "Project ID (preferred)"},
        "project": {"type": "string", "required": False, "description": "Project name (used if no ID)"},
    },
    handler=_archive_project, category="projects", side_effect="write", min_role="manager",
))
register(Capability(
    name="delete_project",
    description="Permanently delete a project and detach its tasks. Admin or owner only.",
    args_schema={
        "project_id": {"type": "string", "required": False, "description": "Project ID (preferred)"},
        "project": {"type": "string", "required": False, "description": "Project name (used if no ID)"},
    },
    handler=_delete_project, category="projects", side_effect="write", min_role="admin",
))
