"""Employee Directory capabilities."""
from __future__ import annotations

import re
from typing import Any, Dict

from . import Capability, register


def _rx(q: str) -> Dict[str, str]:
    return {"$regex": re.escape(q), "$options": "i"}


def _clean(rows):
    """Strip fields the AI shouldn't see (avatars, hashes, mongo _id)."""
    for r in rows:
        r.pop("_id", None)
        r.pop("company_id", None)
        r.pop("password_hash", None)
        r.pop("avatar", None)
    return rows


async def _search_by_name(args: Dict[str, Any], user: Dict[str, Any], db):
    q = (args.get("query") or "").strip()
    if not q:
        return {"results": [], "count": 0, "error": "query is required"}
    rows = await db.employees.find(
        {"company_id": user["company_id"],
         "$or": [{"name": _rx(q)}, {"email": _rx(q)}]},
    ).limit(15).to_list(15)
    return {"results": _clean(rows), "count": len(rows)}


async def _search_by_department(args: Dict[str, Any], user: Dict[str, Any], db):
    dept = (args.get("department") or "").strip()
    if not dept:
        return {"results": [], "count": 0, "error": "department is required"}
    rows = await db.employees.find(
        {"company_id": user["company_id"], "department": _rx(dept)},
    ).limit(50).to_list(50)
    return {"results": _clean(rows), "count": len(rows), "department": dept}


async def _search_by_role(args: Dict[str, Any], user: Dict[str, Any], db):
    role = (args.get("role") or args.get("position") or "").strip()
    if not role:
        return {"results": [], "count": 0, "error": "role/position is required"}
    rows = await db.employees.find(
        {"company_id": user["company_id"], "position": _rx(role)},
    ).limit(50).to_list(50)
    return {"results": _clean(rows), "count": len(rows), "role": role}


async def _find_manager(args: Dict[str, Any], user: Dict[str, Any], db):
    """Return manager-role users for the workspace, optionally filtered by department.

    We cross-reference `users` (has role) with `employees` (has department) by email.
    """
    dept = (args.get("department") or "").strip() or None
    # 1) manager-role user accounts in this workspace
    user_docs = await db.users.find(
        {"company_id": user["company_id"], "role": {"$in": ["manager", "admin", "owner"]}},
        {"_id": 0, "password_hash": 0, "avatar": 0},
    ).to_list(200)
    emails = {u["email"].lower(): u for u in user_docs}
    # 2) map to employee rows for department/position enrichment
    emp_rows = await db.employees.find(
        {"company_id": user["company_id"], "email": {"$in": list(emails.keys())}},
    ).to_list(200)
    enriched = []
    for e in emp_rows:
        u = emails.get(e.get("email", "").lower(), {})
        enriched.append({
            "name": u.get("name") or e.get("name"),
            "email": e.get("email"),
            "role": u.get("role"),
            "department": e.get("department"),
            "position": e.get("position"),
        })
    # If we found employee records for some users but not others, still include the users
    covered = {e["email"] for e in enriched if e.get("email")}
    for em, u in emails.items():
        if em not in covered:
            enriched.append({
                "name": u.get("name"), "email": em, "role": u.get("role"),
                "department": None, "position": None,
            })
    if dept:
        d_rx = re.compile(re.escape(dept), re.IGNORECASE)
        enriched = [e for e in enriched if e.get("department") and d_rx.search(e["department"])]
    return {"results": enriched, "count": len(enriched), "department": dept}


async def _find_email(args: Dict[str, Any], user: Dict[str, Any], db):
    name = (args.get("name") or "").strip()
    if not name:
        return {"results": [], "error": "name is required"}
    rows = await db.employees.find(
        {"company_id": user["company_id"], "name": _rx(name)},
    ).limit(5).to_list(5)
    return {"results": [{"name": r.get("name"), "email": r.get("email")} for r in rows], "count": len(rows)}


async def _find_phone(args: Dict[str, Any], user: Dict[str, Any], db):
    """The current schema does not store phone numbers. This capability
    returns a truthful negative so the AI does NOT hallucinate a number."""
    name = (args.get("name") or "").strip()
    if not name:
        return {"results": [], "error": "name is required"}
    rows = await db.employees.find(
        {"company_id": user["company_id"], "name": _rx(name)},
    ).limit(5).to_list(5)
    return {
        "results": [{"name": r.get("name"), "phone": r.get("phone")} for r in rows if r.get("phone")],
        "count": 0,
        "note": "Phone numbers are not stored in the directory for this workspace.",
    }


register(Capability(
    name="search_employee_by_name",
    description="Look up an employee by (partial) name or email in the company directory.",
    args_schema={"query": {"type": "string", "required": True, "description": "Name or email fragment"}},
    handler=_search_by_name, category="employees",
))
register(Capability(
    name="search_employees_by_department",
    description="List employees in a given department (e.g. 'Engineering', 'HR').",
    args_schema={"department": {"type": "string", "required": True, "description": "Department name"}},
    handler=_search_by_department, category="employees",
))
register(Capability(
    name="search_employees_by_role",
    description="List employees whose job title/position matches a keyword (e.g. 'engineer', 'analyst').",
    args_schema={"role": {"type": "string", "required": True, "description": "Job title / position keyword"}},
    handler=_search_by_role, category="employees",
))
register(Capability(
    name="find_manager",
    description="Find people with manager/admin/owner accounts in this workspace. Optionally scope by department.",
    args_schema={"department": {"type": "string", "required": False, "description": "Optional department filter"}},
    handler=_find_manager, category="employees",
))
register(Capability(
    name="find_employee_email",
    description="Given a person's name, return their work email.",
    args_schema={"name": {"type": "string", "required": True, "description": "Employee name"}},
    handler=_find_email, category="employees",
))
register(Capability(
    name="find_employee_phone",
    description="Given a person's name, return their phone number if available. Truthfully reports when phone is not stored.",
    args_schema={"name": {"type": "string", "required": True, "description": "Employee name"}},
    handler=_find_phone, category="employees",
))
