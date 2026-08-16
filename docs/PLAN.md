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

| #   | Phase                    | Status     | Exit criteria (what "done" means)                                                       |
| --- | ------------------------ | ---------- | --------------------------------------------------------------------------------------- |
| 1   | Planning & Architecture  | DONE       | `PLAN.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SECURITY.md` written; stack locked       |
| 2   | Repository setup         | DONE       | npm workspaces monorepo, TS strict, ESLint/Prettier, shared package, all builds green   |
| 3   | Database                 | DONE       | Prisma schema + migration + seed for `Northstar Labs`; indexes and constraints in place |
| 4   | Authentication           | DONE       | Sign up / in / out, httpOnly cookie sessions, refresh rotation, CSRF, rate limits       |
| 5   | Workspace & membership   | DONE (API) | Workspace CRUD, RBAC guard chain, invitations, tenant isolation verified                |
| 6   | Projects                 | DONE (API) | Project CRUD, members, statuses, prefix, archive                                        |
| 7   | Boards & columns         | DONE (API) | Board/column CRUD, reorder, defaults on project creation, board snapshot                |
| 8   | Tasks                    | DONE (API) | Task CRUD, readable IDs, priority, labels, due dates, assignees, subtasks               |
| 9   | Drag-and-drop            | DONE       | dnd-kit board, fractional ranking persisted, optimistic move with rollback              |
| 10  | WebSockets               | DONE       | Socket.IO gateway, handshake auth middleware, room authorization, Redis adapter         |
| 11  | Real-time board          | DONE       | Live events applied to the query cache, gap detection, dedupe, resync on reconnect      |
| 12  | Task details             | DONE       | Drawer with every field, inline editing, subtasks, attachments, live comments           |
| 13  | Comments                 | DONE       | Comments CRUD + server-resolved @mentions, live updates                                 |
| 14  | Activity                 | DONE       | Activity recorded for all mutations, cursor-paginated feed grouped by day               |
| 15  | Notifications            | DONE       | Fan-out with preferences, live delivery, read/read-all, deep links                      |
| 16  | Team & RBAC              | DONE       | Team page, hashed invitation tokens, role management, last-owner invariant              |
| 17  | Search & command palette | DONE       | Cross-entity search endpoint and the Ctrl/Cmd+K palette                                 |
| 18  | Attachments              | DONE       | Storage abstraction, validated uploads, local + S3 drivers                              |
| 19  | Responsive UI            | DONE       | Mobile drawer and board, light/dark/system themes, accessibility pass with mobile E2E   |
| 20  | Testing                  | DONE       | 146 unit/integration + 21 Playwright tests, all executed                                |
| 21  | Security review          | DONE       | `SECURITY.md` checklist executed; findings and fixes logged there                       |
| 22  | Performance review       | DONE       | N+1 audit, query-count reductions, large-board behaviour documented below               |
| 23  | Docker                   | DONE       | `docker compose up` boots web+api+postgres+redis; `--profile seed` populates the demo   |
| 24  | CI/CD                    | DONE       | GitHub Actions: lint, format, types, unit, integration, build, E2E, audit, images       |
| 25  | Deployment               | DONE       | `docs/DEPLOYMENT.md`: three vendor-neutral options plus the production env matrix       |
| 26  | Documentation            | DONE       | README plus architecture, security, decisions and deployment docs                       |
| 27  | Portfolio                | DONE       | `docs/PORTFOLIO.md` with the case study, skills list and demo script                    |

## 4. Verification record

Everything below was executed, not assumed. The commands are in the README.

| Check                                         | Result                                                           |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                                | Clean (0 errors)                                                 |
| `npm run format:check`                        | Clean                                                            |
| `npm run typecheck`                           | Clean across all three workspaces                                |
| `npm run test:shared`                         | 39 passed                                                        |
| `npm run test:web`                            | 32 passed                                                        |
| `npm run test:api`                            | 75 passed across 6 suites, against a real Postgres               |
| `npm run test:e2e`                            | 21 passed (18 desktop + 3 mobile)                                |
| `npm run build`                               | All three workspaces build                                       |
| `docker compose up -d --build`                | postgres, redis, api and web all healthy                         |
| `docker compose --profile seed run --rm seed` | Demo workspace created                                           |
| `GET /health/ready`                           | `{"status":"ok","database":true,"redis":true}`                   |
| Two-browser realtime                          | A card moved by user A appears for user B, and survives a reload |

`scripts/smoke/core.mjs` (37 exploratory checks against a live stack) is kept in the
repository as the script used while building the backend.

## 5. Bugs the tests found, and the fixes

Recorded because they are the reason the suites exist.

1. **WebSocket handshake race.** Authenticating in `handleConnection` let a fast client
   emit `subscribe` before its identity was resolved. Moved into handshake middleware.
2. **Concurrent rank collisions.** Ranks were resolved before the transaction
   serialised, so parallel moves computed the same position and one aborted. The retry
   now wraps the whole transaction and re-reads the current neighbour each attempt.
3. **Concurrent task creation.** The same shape; fixed by taking the project row lock
   first, which serialises creates as a side effect of minting the readable key.
4. **Empty `dist` on rebuild.** `deleteOutDir` wiped the output while the incremental
   `.tsbuildinfo` survived outside it, so TypeScript skipped emitting and the build
   "succeeded" with nothing in it. The cache now lives inside `dist`.
5. **Docker boot refusal.** Production required secure cookies even over plain HTTP on
   localhost; the rule now keys off an HTTPS origin rather than `NODE_ENV`.
6. **Off-canvas drawer still reachable.** The mobile sidebar was moved with `translate`
   alone, leaving it in the accessibility tree and the tab order.
7. **Duplicate accessible name.** The drawer backdrop and its close button both
   announced "Close navigation". The backdrop is now decorative, with Escape to close.
8. **Rank validation gap.** `rankBetween` only inspected characters up to the first
   difference, so an invalid character further right slipped through.

## 6. Performance notes

- **Board load** is two queries plus one grouped query for completed-subtask counts,
  regardless of task count. The naive version was one query per task: on a 300-task
  board, 300 round trips replaced by one.
- **Realtime events** patch the client cache directly. Twenty events cost twenty
  in-memory writes and zero requests; invalidating instead would cost twenty refetches.
- **Moves** are a single row update and a small payload, independent of board size,
  because of fractional ranking.
- **Card rendering** is memoised, so one card moving does not re-render the board.
- **Indexes** cover every tenant-scoped access path, and the two unbounded feeds
  (activity and notifications) are cursor-paginated over indexed columns.
- **Presence** broadcasts are coalesced to at most one per room per second.

## 7. Risk register

| Risk                                          | Impact                           | Mitigation                                                                                                                              |
| --------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time event storms on large boards        | Broken UX, CPU burn              | Room-scoped broadcasts, one event per mutation, client-side batching via TanStack Query cache writes (no refetch per event)             |
| Lost updates during reconnect                 | Stale board                      | Per-board monotonic sequence + gap detection → full resync (`ARCHITECTURE.md` §6)                                                       |
| Rank collisions on concurrent drags           | Duplicate ordering               | Fractional string ranks + unique `(columnId, rank)` + server-side rebalance on exhaustion                                               |
| Tenant leakage through nested resources       | Critical security bug            | Every resource resolved through a workspace-scoped guard chain; dedicated isolation test suite                                          |
| Cross-origin cookie auth (web ≠ api origin)   | Auth broken in prod or CSRF hole | `SameSite=None; Secure` + double-submit CSRF token + strict CORS allowlist                                                              |
| Windows dev environment without Docker daemon | Cannot run integration tests     | Tests target a `DATABASE_URL` that can point at Docker **or** a local Postgres; compose file is not a hard dependency of the test suite |
| Scope creep (50-section spec)                 | Nothing finished well            | Phase gates above; a phase is not left until its core works                                                                             |

## 8. Working agreement

- One logical commit per completed phase, repository always in a runnable state.
- No `TODO`, "Coming soon", dead routes or non-functional buttons in the final product.
- Every technical decision that had a real alternative is recorded in `DECISIONS.md`.
- Tests are executed, never assumed. Commands and their output are reported honestly.
