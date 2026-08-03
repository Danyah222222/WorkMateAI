# WorkMate AI — Product Requirements Document

## Original Problem Statement
Build "WorkMate AI", a modern full-stack web application serving as a private AI workplace assistant for companies. Evolved from an MVP demo to a Production Multi-tenant SaaS platform.

## Core Requirements
- Multi-tenant workspace isolation with role-based access (Owner, Admin, Manager, Employee)
- Admin Dashboard: knowledge (PDF/CSV uploads), team members, tasks, and Kanban projects
- Employee Chat with Claude Sonnet 4.5 (streaming, history, memory extraction)
- n8n workflow automations (Leave Request, IT Support) triggered from chat
- Production-readiness: password reset, profile, notifications, CSV exports, task comments, rate-limiting

## Explicit User Constraints
- SKIP Resend email delivery, Task attachments, Calendar views, PDF exports
- Password reset token surfaced in-response as `dev_token` and shown in UI as copyable link (MVP fallback until email is wired)
- Maintain workspace isolation (`company_id`) rigorously; UUID4 string IDs (no Mongo ObjectId)
- Do NOT redesign existing UI — integrate additions into current layout

## Architecture
- Frontend: React 19, Tailwind, Shadcn UI, React Router 7, Recharts, Axios
- Backend: FastAPI (async), Motor, JWT auth (bcrypt), slowapi (rate limiting)
- DB: MongoDB — schemaless, Pydantic-validated, UUID4 string IDs
- LLM: Claude Sonnet 4.5 via Emergent Universal Key

## What's Been Implemented (Feb 2026)
- Base multi-tenant SaaS with workspaces, invitations, role-based access
- AI chat with source-grounded answers, thumbs feedback, personalized memory
- n8n webhook proxies (Leave, IT Support)
- Kanban Projects with drag-and-drop, auto-status
- Productivity dashboard with charts
- Rate limiting (`slowapi`), MongoDB indexes
- Backend endpoints: password reset, profile, notifications, task comments, CSV export
- Frontend pages: ForgotPassword, ResetPassword, Profile, NotificationBell
- **Feb 2026 — Password Recovery Workflow (COMPLETE, E2E TESTED 9/9)**
  - `POST /api/auth/forgot-password` — rate-limited 5/hr, returns `{ok, dev_token}`, no enumeration for unknown emails
  - `POST /api/auth/reset-password` — rate-limited 10/hr, validates token+expiry+used, single-use enforced
  - `/forgot-password` page: email input → sent card with copyable reset link (dev_token)
  - `/reset-password/:token` page: validates, min 6 chars, toasts, redirects to /login
  - Forgot link on /login page

## Prioritized Backlog

### P0 (Next Up)
- Task Comments UI in AdminDashboard (backend `POST /api/tasks/{id}/comments` ready — needs UI thread in task detail modal)
- CSV Export button in AdminDashboard Projects/Tasks tab (backend `GET /api/tasks/export/csv` ready)

### P1
- Avatar upload on Profile page (base64, ties to `PATCH /api/profile`)
- Activity/Audit history UI (backend `activity` collection exists)
- Notifications UI polish + unread counter in NotificationBell

### P2
- Refactor `AdminDashboard.jsx` (~2000 LOC) into sub-components
- Move JWT out of localStorage (httpOnly cookies) to reduce XSS surface

### Deferred (Explicitly Skipped by User)
- Resend email delivery, Task attachments, Calendar view, PDF exports

## Key API Endpoints
- Auth: `/api/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/change-password`
- Profile: `GET /api/profile`, `PATCH /api/profile`
- Notifications: `GET /api/notifications`, `PATCH /api/notifications/{id}/read`
- Tasks: `POST /api/tasks/{id}/comments`, `GET /api/tasks/export/csv`

## Test Credentials
See `/app/memory/test_credentials.md`
