"""Capability registry + base types.

A Capability is a *server-side* callable the AI can invoke. The AI never
executes anything itself; it only proposes calls. The executor runs them.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

ROLE_LEVEL: Dict[str, int] = {
    "employee": 0,
    "manager": 1,
    "admin": 2,
    "owner": 3,
}

Handler = Callable[[Dict[str, Any], Dict[str, Any], Any], Awaitable[Dict[str, Any]]]
# handler(args, current_user, db) -> {"...": ...}


@dataclass
class Capability:
    name: str
    description: str          # shown to the planner LLM
    args_schema: Dict[str, Any]  # {"arg_name": {"type": "string", "required": bool, "description": "..."}}
    handler: Handler
    category: str = "misc"        # employees | knowledge | projects | tasks | hr | it
    min_role: str = "employee"
    side_effect: str = "read"     # "read" or "write"


_REGISTRY: Dict[str, Capability] = {}


def register(cap: Capability) -> None:
    if cap.name in _REGISTRY:
        raise RuntimeError(f"Capability '{cap.name}' already registered")
    if cap.min_role not in ROLE_LEVEL:
        raise ValueError(f"Unknown min_role: {cap.min_role}")
    _REGISTRY[cap.name] = cap


def get(name: str) -> Optional[Capability]:
    return _REGISTRY.get(name)


def all_capabilities() -> List[Capability]:
    return list(_REGISTRY.values())


def available_for(user: Dict[str, Any]) -> List[Capability]:
    """Only capabilities the user's role allows."""
    lvl = ROLE_LEVEL.get(user.get("role") or "employee", 0)
    return [c for c in _REGISTRY.values() if ROLE_LEVEL[c.min_role] <= lvl]


def catalog_for_prompt(user: Dict[str, Any]) -> str:
    """A compact catalog string the planner sees."""
    lines = []
    for c in available_for(user):
        arg_lines = []
        for a_name, spec in c.args_schema.items():
            req = "required" if spec.get("required") else "optional"
            t = spec.get("type", "string")
            desc = spec.get("description", "")
            arg_lines.append(f"    - {a_name} ({t}, {req}): {desc}")
        args_str = "\n".join(arg_lines) if arg_lines else "    (no arguments)"
        lines.append(
            f"* {c.name} [{c.category}, {c.side_effect}, min_role={c.min_role}]\n"
            f"  {c.description}\n"
            f"  args:\n{args_str}"
        )
    return "\n".join(lines) if lines else "(no capabilities available)"


# Self-register all built-in capability modules at import time.
# Order doesn't matter — each module calls register() at import.
def _load_builtin_modules() -> None:
    from . import employees  # noqa: F401
    from . import knowledge  # noqa: F401
    from . import projects   # noqa: F401
    from . import tasks      # noqa: F401
    from . import hr         # noqa: F401
    from . import it         # noqa: F401


_load_builtin_modules()
