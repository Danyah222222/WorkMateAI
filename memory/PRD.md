# WorkMate AI — Product Requirements Document

## Current State (Feb 2026)
An enterprise multi-tenant SaaS AI assistant with:
- JWT auth, RBAC (owner/admin/manager/employee), invitations, password reset, email verification
- Streaming Claude chat with per-user memory extraction
- Kanban projects + tasks + task comments + CSV export (backend)
- **AI Capability Layer** — 28 capabilities across 6 categories (employees, knowledge, projects, tasks, hr, it), Haiku planner + Sonnet responder
- **AI Action Confirmation Workflow** (Feb 2026, NEW) — every write capability requires explicit user confirmation before execution

## Explicit User Constraints
- Do NOT redesign UI; reuse existing chat streaming
- Resend graceful fallback (send when key set, else surface dev_token)
- Password policy min 8 chars + letter + digit
- Task attachments, calendar view, PDF exports remain SKIPPED
- RAG deferred to a later milestone

## AI Confirmation Workflow (Feb 2026)
- New collection `pending_actions`: {id, conversation_id, user_id, company_id, capability_name, args, preview{label,category,side_effect,args,missing[]}, status: pending|confirmed|executed|cancelled|failed, created_at, resolved_at, result, error, message_id}
- Executor detects `cap.side_effect == "write"` → creates a `pending_action` row instead of running the capability
- SSE stream emits `{"type":"action_pending", "pending_action":{...}}` after the response header
- Chat message stores `pending_action_id`; `GET /conversations/{id}/messages` enriches messages with the current pending_action doc so refresh restores card state
- Idempotency: state transitions use atomic `find_one_and_update({status:"pending"})` — duplicate confirm/cancel can never double-execute
- Confirm re-checks role (defense-in-depth), whitelists edited_args to declared arg keys, runs the SAME capability handler (no logic duplication)
- All state changes audit-logged to `ai_tool_calls.phase = confirmation_requested | confirmed_executed | cancelled | failed`
- Semantics:
  - confirm on pending → execute (200)
  - confirm on already-executed → returns same record (200 idempotent)
  - confirm on cancelled/failed → 409
  - cancel on pending → cancelled (200)
  - cancel on non-pending → 409

## Write Capabilities (all require confirmation)
- `create_leave_request` (employee+) — validates ISO dates and range, persists to `leave_requests`, fires n8n webhook
- `create_it_ticket` (employee+) — persists to `it_tickets`, fires n8n webhook
- `update_task_status` (employee for own tasks, manager+ for any) — status/kanban_status, auto-syncs both
- `assign_task` (manager+) — resolves assignee by email or user_id in workspace
- `archive_project` (manager+) — sets status=archived
- `delete_project` (admin+) — deletes project, detaches tasks (dangerous card variant)

## New Endpoints
- `GET /api/ai/pending-actions/{id}` — owner or manager+ in workspace
- `GET /api/ai/pending-actions?conversation_id=&limit=` — caller's own
- `POST /api/ai/pending-actions/{id}/confirm` — rate limited 30/min, atomic transition, executes handler
- `POST /api/ai/pending-actions/{id}/cancel` — rate limited 60/min, atomic transition

## Frontend
- New `components/PendingActionCard.jsx` — inline card in assistant message bubble with 4 visual states (pending / executed / cancelled / failed). Confirm/Cancel disabled while busy; buttons hidden when non-pending; special destructive variant for `delete_project`
- `EmployeeChat.jsx` — captures `action_pending` SSE event, attaches to next assistant message; renders `PendingActionCard` inline; on refresh uses `message.pending_action` from the enriched messages payload
- No layout changes to any page

## Verified (this milestone)
- 21/21 pytest pass (8 new confirmation tests + 13 existing capability tests)
- Live UI smoke: leave-request confirmation E2E — card rendered with fields, Confirm transitioned to executed, buttons removed to prevent duplicates
- Cross-user, role-gate, cancel-after-cancel, confirm-after-cancel, confirm-after-executed all covered

## Prioritized Backlog

### P0 Next
- Enterprise RAG (chunking + embeddings + vector search + `[SRC n]` citations)
- Admin "AI Console" tab: filter `ai_tool_calls` and `pending_actions`, see approvals for manager-only actions

### P1
- Manager approval flow for employee-created write actions (currently self-service)
- "Edit before confirming" inline field editing in the card
- Document-level ACLs (`visibility` on documents, applied at retrieval time)
- Refactor `AdminDashboard.jsx` and `server.py` into modules

### P2
- Provider failover, budget/cost tracking, prompt-injection sanitizer
- Move JWT to httpOnly cookies

## Env vars
Required: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS`
Optional: `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`, `APP_URL`, `N8N_LEAVE_WEBHOOK`, `N8N_IT_WEBHOOK`

## Test Credentials
See `/app/memory/test_credentials.md`
