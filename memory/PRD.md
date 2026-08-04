# WorkMate AI — Product Requirements Document

## Original Problem Statement
Build "WorkMate AI", a modern full-stack web application serving as a private AI workplace assistant for companies. Evolved from an MVP demo to a Production Multi-tenant SaaS platform, and now (Feb 2026) into an Enterprise AI Agent with a capability layer.

## Explicit User Constraints
- Resend integration: graceful fallback (send when `RESEND_API_KEY` set, otherwise surface dev_token/link in UI)
- Password policy: min 8 chars + letter + digit
- Email-change verification: link to NEW email, single-use, 2h expiry
- DO NOT redesign existing UI; DO NOT rebuild existing AI features; reuse chat streaming
- RAG deferred to a later milestone — Feb 2026 milestone is the capability layer only
- SKIPPED: Task attachments, Calendar views, PDF exports

## Architecture
- **Frontend**: React 19, Tailwind, Shadcn UI, React Router 7, Axios
- **Backend**: FastAPI + Motor + slowapi + optional Resend
- **DB**: MongoDB (UUID4 string IDs)
- **AI**: Claude Sonnet 4.5 (responder) + Claude Haiku 4.5 (planner + memory) via Emergent Universal Key
- **AI Capability Layer** (new, Feb 2026):
  - `backend/ai/capabilities/*.py` — 24 registered capabilities across 6 categories
  - `backend/ai/planner.py` — Haiku picks 0–3 capabilities per turn (JSON-only)
  - `backend/ai/executor.py` — runs plan under authenticated user, enforces `min_role`, scopes by `company_id`, logs each call
  - Integrated into existing `/api/chat/stream` — planner runs → executor runs → results injected as `=== CAPABILITY RESULTS ===` block into existing Sonnet prompt
  - SSE stream emits new `{"type":"capability", ...}` events (current frontend safely ignores unknown types)

## Registered Capabilities (24)
- **employees (6)**: search_employee_by_name, search_employees_by_department, search_employees_by_role, find_manager, find_employee_email, find_employee_phone (truthfully returns "not stored")
- **knowledge (3)**: search_documents, search_company_policies, search_hr_handbook
- **projects (4)**: search_projects, list_project_members, list_project_deadlines, list_project_milestones
- **tasks (4)**: search_tasks, my_tasks, overdue_tasks, completed_tasks (managers+ see all; employees see own)
- **hr (4)**: create_leave_request (persists to `leave_requests` + n8n fire-and-forget), check_leave_policy, explain_hr_procedure, list_my_leave_requests
- **it (3)**: create_it_ticket (persists to `it_tickets` + n8n fire-and-forget), check_ticket_status, search_it_documentation

## Security & Isolation Guarantees
- Every capability accepts `(args, current_user, db)` — `company_id` is always taken from the authenticated JWT user, NEVER from LLM-supplied args
- `min_role` gate enforced in executor (`ROLE_LEVEL`); forbidden calls return an error the LLM sees and reports honestly
- Task/ticket scoping: employees see own only; managers+ see workspace-wide
- All calls audit-logged to `ai_tool_calls` (name, category, side_effect, args, result_summary, error, success, latency_ms, user_role)
- Framework designed for easy extension — add a module, call `register(Capability(...))`

## What's Been Implemented (dated)
- Feb 2026 — Password recovery E2E tested
- Feb 2026 — Production User Account System (24 backend + 18 frontend scenarios pass)
- Feb 2026 — **AI Capability Layer** (13/13 unit + integration tests pass; two live SSE integration tests confirm planner correctly fires for data questions and skips for greetings)

## New Collections (Feb 2026)
- `ai_tool_calls` — one row per capability invocation
- `leave_requests` — persisted so `list_my_leave_requests` + `check_leave_policy` work without n8n
- `it_tickets` — persisted so `check_ticket_status` works without n8n

## Prioritized Backlog

### P0 (Next Up)
- Frontend "tool chips" — render the new `capability` SSE events as subtle chips under assistant messages
- Task Comments UI in AdminDashboard modal (backend ready)
- CSV Export button in AdminDashboard (backend ready)

### P1
- **RAG** — deferred milestone: chunking + embeddings + vector index (Atlas Vector Search / Qdrant) + `[SRC n]` citations. Replaces `search_documents`, `search_company_policies`, `search_hr_handbook`, `search_it_documentation` with true semantic search behind the same capability interface
- Confirmation gate UI for write capabilities (`create_leave_request`, `create_it_ticket`)
- Multi-hop agent loop (allow planner to see the first round's results and make a second call)
- Admin "AI Console" tab: view `ai_tool_calls` with filters
- Document-level ACLs (`visibility` field + retrieval-time filter)
- Refactor `AdminDashboard.jsx` (~2000 LOC) and `server.py` (~2200 LOC) into modules

### P2
- Provider failover, budget/cost tracking (`ai_usage`), prompt-injection sanitizer
- Move JWT to httpOnly cookies

## Env vars
- Required: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS`
- Optional: `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`, `APP_URL`, `N8N_LEAVE_WEBHOOK`, `N8N_IT_WEBHOOK`

## Test Credentials
See `/app/memory/test_credentials.md`
