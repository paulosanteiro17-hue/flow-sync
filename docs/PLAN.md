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

| # | Phase | Status | Exit criteria (what "done" means) |
|---|-------|--------|-----------------------------------|
| 1 | Planning & Architecture | DONE | `PLAN.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SECURITY.md` written; stack locked |
| 2 | Repository setup | DONE | npm workspaces monorepo, TS strict, ESLint/Prettier, shared package, all builds green |
| 3 | Database | DONE | Prisma schema + migration + seed for `Northstar Labs`; indexes and constraints in place |
| 4 | Authentication | DONE | Sign up / in / out, httpOnly cookie sessions, refresh rotation, CSRF, rate limits, tests |
| 5 | Workspace & membership | DONE | Workspace CRUD, RBAC guard, tenant isolation tests |
| 6 | Projects | DONE | Project CRUD, members, statuses, prefix, archive |
| 7 | Boards & columns | DONE | Board/column CRUD, reorder, defaults on project creation |
| 8 | Tasks | DONE | Task CRUD, readable IDs, priority, labels, due dates, assignees, subtasks |
| 9 | Drag-and-drop | DONE | dnd-kit board, fractional ranking persisted, optimistic move + rollback |
| 10 | WebSockets | DONE | Socket.IO gateway, cookie handshake auth, room authorization, Redis adapter |
| 11 | Real-time board | DONE | Live task/column events, sequence numbers, dedup, resync-on-reconnect |
| 12 | Task details | DONE | Task drawer with all fields, editing, activity |
| 13 | Comments | DONE | Comments CRUD + @mentions, live updates |
| 14 | Activity | DONE | Activity events recorded for all mutations, cursor-paginated feed |
| 15 | Notifications | DONE | Notification center, live delivery, read/read-all, deep links |
| 16 | Team & RBAC | DONE | Team page, invitations with hashed tokens, role management |
| 17 | Search & command palette | DONE | Global search endpoint + ⌘K palette |
| 18 | Attachments | DONE | Storage abstraction, validated uploads, local + S3 drivers |
| 19 | Responsive UI | DONE | Mobile board, tablet layouts, light/dark/system themes, a11y pass |
| 20 | Testing | DONE | Backend Jest+Supertest, frontend Vitest+RTL, Playwright E2E incl. two-user realtime |
| 21 | Security review | DONE | `SECURITY.md` checklist executed, findings fixed |
| 22 | Performance review | DONE | N+1 audit, query counts, large-board behaviour documented |
| 23 | Docker | DONE | `docker compose up` boots web+api+postgres+redis |
| 24 | CI/CD | DONE | GitHub Actions: install, lint, typecheck, unit, build, E2E |
| 25 | Deployment | DONE | Vendor-neutral deploy guide + production env matrix |
| 26 | Documentation | DONE | README + architecture/security/decisions docs finalised |
| 27 | Portfolio | DONE | `PORTFOLIO.md` with Upwork-ready copy and demo script |

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
