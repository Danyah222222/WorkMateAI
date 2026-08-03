# WorkMate AI — Product Requirements Document

## Original Problem Statement
Build "WorkMate AI", a modern full-stack web application serving as a private AI workplace assistant for companies. Evolved from an MVP demo to a Production Multi-tenant SaaS platform.

## Core Requirements
- Multi-tenant workspace isolation with role-based access (Owner, Admin, Manager, Employee)
- Admin Dashboard: knowledge (PDF/CSV uploads), team members, tasks, and Kanban projects
- Employee Chat with Claude Sonnet 4.5 (streaming, history, memory extraction)
- n8n workflow automations (Leave Request, IT Support) triggered from chat
- Production-ready user account system (Feb 2026)

## Explicit User Constraints
- Resend integration: **graceful fallback pattern** — if `RESEND_API_KEY` is set in `.env`, emails are sent; otherwise the token/verification link is returned in the API response and shown in the UI. No key is required today
- Password policy (backend `validate_password_strength`): min 8 chars + must contain letter + digit
- Email-change verification: link is sent to the NEW email; change is applied only when the link is clicked (single-use token, 2h expiry)
- Welcome email is sent on register and accept-invite (no-op when Resend isn't configured)
- SKIPPED (still): Task attachments, Calendar views, PDF exports
- Do NOT redesign existing UI — integrate additions into the current layout

## Architecture
- Frontend: React 19, Tailwind, Shadcn UI, React Router 7, Recharts, Axios
- Backend: FastAPI (async), Motor, JWT (bcrypt), slowapi (rate limiting), Resend SDK (optional)
- DB: MongoDB — schemaless, Pydantic-validated, UUID4 string IDs
- LLM: Claude Sonnet 4.5 via Emergent Universal Key

## What's Been Implemented (Feb 2026)
- Multi-tenant SaaS foundation: workspaces, invitations, role-based access
- AI chat with source-grounded answers, thumbs feedback, personalized memory
- n8n webhook proxies (Leave, IT Support)
- Kanban Projects, drag-and-drop, auto-status
- Productivity dashboard with charts
- Rate limiting (slowapi), MongoDB indexes
- Task comments backend, CSV export backend, notifications UI
- Password recovery (forgot/reset) — E2E tested
- **Feb 2026 — Production User Account System (COMPLETE, backend 24/24 + frontend 18/18)**
  - Password strength enforced on register / accept-invite / change / reset (8+ chars, letter + digit)
  - Live `PasswordStrength` meter component on all password entry forms
  - Forgot / reset password with Resend-or-dev-token fallback
  - Change password (audit logged as `password_changed`)
  - Change email with verification link to NEW address (audit logged as `email_change_requested` → `email_changed`), pending-email banner, cancel-change, single-use tokens
  - Profile page shows: avatar upload, display name edit, workspace, role, member-since date, current email, pending-email banner
  - New `/verify-email/:token` page
  - `email_service.py` module with graceful Resend fallback and professional HTML templates (welcome, password reset, email-change verification)
  - Audit log entries for `password_changed`, `password_reset_requested`, `email_change_requested`, `email_changed`, `profile_updated`
  - AuthContext 401 interceptor now whitelists change-password / email-change / login so form-level 401s don't kick users out
  - Mobile responsive polish on all auth pages + Profile; `aria-hidden` on decorative icons, `aria-label` on icon buttons, `noValidate` on forms

## Prioritized Backlog

### P0 (Next Up)
- Task Comments UI in AdminDashboard task detail modal (backend ready)
- CSV Export button in AdminDashboard Projects/Tasks tab (backend ready)

### P1
- Activity/Audit history UI tab (backend `activity` collection is rich now)
- Refactor `AdminDashboard.jsx` (~2000 LOC) and `server.py` (~2200 LOC) into sub-modules for maintainability
- Expose invite token in `POST /api/invites` dev response to unblock E2E for accept-invite policy
- Consider `X-Forwarded-For`-aware key_func for slowapi (per-user limits behind ingress)

### P2
- Move JWT out of localStorage (httpOnly cookies) to reduce XSS surface

### Deferred (Explicitly Skipped by User)
- Task attachments, Calendar view, PDF exports

## Key API Endpoints (User Account)
- `POST /api/auth/register` — 8+ chars, letter + digit; sends welcome email
- `POST /api/auth/login`
- `POST /api/auth/forgot-password` → `{ok, email_sent, dev_token?}`
- `POST /api/auth/reset-password` — validates single-use token, applies strength policy
- `POST /api/auth/change-password` — verifies current, applies strength policy, audit-logged
- `POST /api/auth/accept-invite` — sends welcome email
- `GET /api/profile` — returns identity + `created_at` + `pending_email` + `email_delivery_enabled`
- `PATCH /api/profile` — name + avatar
- `POST /api/profile/email/request-change` — sends verification link (or returns dev_token)
- `POST /api/profile/email/verify` — applies email change (single-use)
- `POST /api/profile/email/cancel-change` — invalidates any pending change

## Test Credentials
See `/app/memory/test_credentials.md` (admin@technova.com / admin123 remains authoritative)

## Env vars (backend/.env)
- Required: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS`
- Optional (email delivery): `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`, `APP_URL`
