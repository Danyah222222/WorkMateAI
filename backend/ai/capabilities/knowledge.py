"""Knowledge Base capabilities. Naive text search over uploaded documents.

Real RAG (chunking + embeddings + vector index) is deferred to a later
milestone; the interface here is intentionally shaped so it can be swapped
out with vector search without changing the AI-facing contract.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

from . import Capability, register

_SNIPPET_RADIUS = 220  # chars either side of a hit
_MAX_HITS_PER_DOC = 2
_MAX_DOCS = 6


def _find_snippets(content: str, query: str) -> List[str]:
    if not content or not query:
        return []
    try:
        rx = re.compile(re.escape(query), re.IGNORECASE)
    except re.error:
        return []
    out: List[str] = []
    for m in rx.finditer(content):
        start = max(0, m.start() - _SNIPPET_RADIUS)
        end = min(len(content), m.end() + _SNIPPET_RADIUS)
        piece = content[start:end].strip()
        if start > 0:
            piece = "… " + piece
        if end < len(content):
            piece = piece + " …"
        out.append(piece)
        if len(out) >= _MAX_HITS_PER_DOC:
            break
    return out


async def _search_documents_impl(user, db, query: str, filename_filter: str = None):
    query = (query or "").strip()
    if not query:
        return {"results": [], "count": 0, "error": "query is required"}
    mongo_q: Dict[str, Any] = {"company_id": user["company_id"]}
    if filename_filter:
        mongo_q["filename"] = {"$regex": filename_filter, "$options": "i"}
    docs = await db.documents.find(mongo_q, {"_id": 0}).to_list(200)
    hits = []
    for d in docs:
        snips = _find_snippets(d.get("content", "") or "", query)
        if not snips:
            continue
        hits.append({
            "document_id": d.get("id"),
            "filename": d.get("filename"),
            "file_type": d.get("file_type"),
            "matches": snips,
        })
        if len(hits) >= _MAX_DOCS:
            break
    return {"results": hits, "count": len(hits), "query": query}


async def _search_documents(args, user, db):
    return await _search_documents_impl(user, db, args.get("query", ""))


async def _search_policies(args, user, db):
    """Filter to documents whose filename hints at policy/handbook/procedure."""
    return await _search_documents_impl(
        user, db, args.get("query", ""),
        filename_filter=r"polic|handbook|procedure|guideline|manual",
    )


async def _search_hr(args, user, db):
    return await _search_documents_impl(
        user, db, args.get("query", ""),
        filename_filter=r"hr|human.?resource|leave|vacation|benefit|payroll|onboard|handbook",
    )


async def _search_it_docs(args, user, db):
    return await _search_documents_impl(
        user, db, args.get("query", ""),
        filename_filter=r"it|helpdesk|support|password|vpn|network|security|access",
    )


register(Capability(
    name="search_documents",
    description="Full-text search across all uploaded company documents. Returns file names and matching passages.",
    args_schema={"query": {"type": "string", "required": True, "description": "What to search for"}},
    handler=_search_documents, category="knowledge",
))
register(Capability(
    name="search_company_policies",
    description="Search company policies, handbooks and procedure documents only.",
    args_schema={"query": {"type": "string", "required": True, "description": "Policy topic or keyword"}},
    handler=_search_policies, category="knowledge",
))
register(Capability(
    name="search_hr_handbook",
    description="Search HR-related documents (leave, benefits, payroll, onboarding, handbook).",
    args_schema={"query": {"type": "string", "required": True, "description": "HR question or keyword"}},
    handler=_search_hr, category="knowledge",
))
