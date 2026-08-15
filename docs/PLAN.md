# FlowSync — Delivery Plan

> Living document. Updated at the end of every phase.
> Status legend: `TODO` · `IN PROGRESS` · `DONE`

## 1. Product summary

FlowSync is a multi-tenant SaaS for collaborative project management. The headline
capability is **real-time collaboration**: two people looking at the same board see
each other's changes instantly, with presence, live comments and live notifications.

Hierarchy: `Workspace → Project → Board → BoardColumn → Task → (Subtask | Comment | Attachment | ActivityEvent)`

## 2. Non-goals (explicitly out of scope for the MVP)

- Full CRDT/OT text co-editing. We use server-authoritative last-write-wins with
  field-level merge for task updates (see `DECISIONS.md` D-011).
- Billing/payments. The pricing section on the landing page is presentational only
  and is labelled as such — no fake "Subscribe" buttons that do nothing.
- Email delivery. Invitations and notifications go through a `MailerService`
  abstraction that logs to console in development and is wired for a real provider
  in production (documented, not shipped with a vendor key).
- Native mobile app, offline mode, Gantt/calendar views (see README "Future Improvements").

## 3. Phase plan

Status is updated at the end of each phase and reflects what has actually been run,
not what has been written.

| # | Phase | Status | Exit criteria (what "done" means) |
|---|-------|--------|-----------------------------------|
| 1 | Planning & Architecture | DONE | `PLAN.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SECURITY.md` written; stack locked |
| 2 | Repository setup | DONE | npm workspaces monorepo, TS strict, ESLint/Prettier, shared package, all builds green |
| 3 | Database | DONE | Prisma schema + migration + seed for `Northstar Labs`; indexes and constraints in place |
| 4 | Authentication | DONE | Sign up / in / out, httpOnly cookie sessions, refresh rotation, CSRF, rate limits |
| 5 | Workspace & membership | DONE (API) | Workspace CRUD, RBAC guard chain, invitations, tenant isolation verified |
| 6 | Projects | DONE (API) | Project CRUD, members, statuses, prefix, archive |
| 7 | Boards & columns | DONE (API) | Board/column CRUD, reorder, defaults on project creation, board snapshot |
| 8 | Tasks | DONE (API) | Task CRUD, readable IDs, priority, labels, due dates, assignees, subtasks |
| 9 | Drag-and-drop | IN PROGRESS | Server-side ranking done and verified under concurrency; dnd-kit board pending |
| 10 | WebSockets | DONE (API) | Socket.IO gateway, handshake auth middleware, room authorization, Redis adapter |
| 11 | Real-time board | IN PROGRESS | Server events done; client apply/dedupe/resync pending |
| 12 | Task details | IN PROGRESS | API complete; task drawer pending |
| 13 | Comments | DONE (API) | Comments CRUD + server-resolved @mentions, live events |
| 14 | Activity | DONE (API) | Activity recorded for all mutations, cursor-paginated feed |
| 15 | Notifications | DONE (API) | Fan-out with preferences, live delivery, read/read-all, deep links |
| 16 | Team & RBAC | DONE (API) | Roles, hashed invitation tokens, last-owner invariant |
| 17 | Search & command palette | IN PROGRESS | Search endpoint done; ⌘K palette pending |
| 18 | Attachments | DONE (API) | Storage abstraction, validated uploads, local + S3 drivers |
| 19 | Responsive UI | TODO | Mobile board, tablet layouts, light/dark/system themes, a11y pass |
| 20 | Testing | TODO | Backend Jest+Supertest, frontend Vitest+RTL, Playwright E2E incl. two-user realtime |
| 21 | Security review | TODO | `SECURITY.md` checklist executed, findings fixed |
| 22 | Performance review | TODO | N+1 audit, query counts, large-board behaviour documented |
| 23 | Docker | IN PROGRESS | Postgres and Redis running; api/web images pending |
| 24 | CI/CD | TODO | GitHub Actions: install, lint, typecheck, unit, build, E2E |
| 25 | Deployment | TODO | Vendor-neutral deploy guide + production env matrix |
| 26 | Documentation | TODO | README + architecture/security/decisions docs finalised |
| 27 | Portfolio | TODO | `PORTFOLIO.md` with Upwork-ready copy and demo script |

### Verified so far

Run against a live API with Postgres and Redis (`scripts/smoke/core.mjs`), 37 checks
covering: the two-user realtime move, echo suppression, live comments and mention
notifications, the RBAC matrix per role, tenant isolation across nine endpoints plus
socket subscriptions, and concurrent drops onto the same slot producing distinct ranks.
These are exploratory checks; the committed Jest/Vitest/Playwright suites land in phase 20.

## 4. Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Real-time event storms on large boards | Broken UX, CPU burn | Room-scoped broadcasts, one event per mutation, client-side batching via TanStack Query cache writes (no refetch per event) |
| Lost updates during reconnect | Stale board | Per-board monotonic sequence + gap detection → full resync (`ARCHITECTURE.md` §6) |
| Rank collisions on concurrent drags | Duplicate ordering | Fractional string ranks + unique `(columnId, rank)` + server-side rebalance on exhaustion |
| Tenant leakage through nested resources | Critical security bug | Every resource resolved through a workspace-scoped guard chain; dedicated isolation test suite |
| Cross-origin cookie auth (web ≠ api origin) | Auth broken in prod or CSRF hole | `SameSite=None; Secure` + double-submit CSRF token + strict CORS allowlist |
| Windows dev environment without Docker daemon | Cannot run integration tests | Tests target a `DATABASE_URL` that can point at Docker **or** a local Postgres; compose file is not a hard dependency of the test suite |
| Scope creep (50-section spec) | Nothing finished well | Phase gates above; a phase is not left until its core works |

## 5. Working agreement

- One logical commit per completed phase, repository always in a runnable state.
- No `TODO`, "Coming soon", dead routes or non-functional buttons in the final product.
- Every technical decision that had a real alternative is recorded in `DECISIONS.md`.
- Tests are executed, never assumed. Commands and their output are reported honestly.
