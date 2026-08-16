# FlowSync — Portfolio Material

Ready-to-paste copy for Upwork, GitHub and a personal site.

---

## Title

**FlowSync — Real-Time Collaborative Project Management Platform**

---

## Short description (Upwork project card, ~250 characters)

A multi-tenant SaaS for project management where teams work on the same Kanban board
simultaneously. Built with Next.js, NestJS, PostgreSQL, Redis and WebSockets: drag a
card in one browser and it moves in everyone else's, instantly.

---

## Full description

FlowSync is a collaborative project management platform — workspaces, projects, Kanban
boards, tasks, comments, notifications and roles — built so that several people can
work on the same board at the same time without stepping on each other.

The product surface is what you would expect from a modern SaaS tool: readable task ids
(`WEB-101`), priorities, labels, due dates, assignees, subtask progress, attachments,
a global search with a ⌘K command palette, an activity feed and a notification centre.
The engineering underneath is where the work went.

**Real-time is the architecture, not a feature bolted on.** Every mutation is broadcast
to the rooms it belongs to over WebSockets, carrying a monotonic per-room sequence
number and a unique event id. That gives the client three things it otherwise could not
have: it can detect that it _missed_ an event and resynchronise rather than silently
diverging, it can drop duplicates delivered by a reconnect, and it can ignore the echo
of its own change so an optimistic update is never overwritten by its own round trip.
Events patch the client cache directly instead of triggering refetches, so a busy board
costs in-memory writes rather than a request storm.

**Ordering is a solved problem, properly.** Card positions use fractional lexicographic
rank strings rather than integers, so moving a card is a single row update and a tiny
payload regardless of board size — where an integer `position` column would rewrite
every row below the insertion point. The client never invents a position: it names the
two cards it dropped between, and the server computes the rank inside a transaction.
That is what makes two people dropping onto the same slot at the same instant produce
two distinct, correctly ordered positions instead of a constraint violation. Ranks grow
slowly under repeated insertions into the same gap, so a column rebalances itself
automatically — verified by a test that performs sixty consecutive drops.

**Multi-tenancy is enforced where it counts.** Every tenant-owned row carries its
workspace, every tenant-scoped route is nested under it, and deep resources are
resolved in a query joined to the caller's membership — there is no path that loads a
record by id and checks ownership afterwards. Refusals return `404` rather than `403`,
because a `403` confirms that the resource exists. A dedicated test suite walks fifteen
read endpoints and every mutation as a member of a different workspace, plus WebSocket
subscriptions, and asserts nothing leaks.

**Security was designed in.** Argon2id password hashing, sessions in `httpOnly` cookies
with rotating refresh tokens and reuse detection that revokes an entire token family,
double-submit CSRF protection, a four-role permission matrix enforced server-side,
upload validation down to magic bytes, and rate limiting on every abusable endpoint.

**It is tested, and the tests were run.** 146 unit and integration tests plus 21
end-to-end tests. The backend suite runs against a real PostgreSQL schema — the ORM is
never mocked, because tenant isolation, cascade deletes, unique constraints and
transaction behaviour only exist in the database. The headline end-to-end test drives
two independent browser contexts: one user moves a card, the other must see it move.

The whole thing runs with `docker compose up`, ships a GitHub Actions pipeline that
lints, type-checks, tests, builds and runs the browser suite against real Postgres and
Redis services, and is documented well enough that another engineer could pick it up.

---

## The business problem

Teams that coordinate through project management tools hit the same friction: the board
is a snapshot, not a shared surface. Two people plan the same sprint, both drag cards,
and one of them is looking at a stale screen. Somebody refreshes, work is duplicated, a
card ends up in the wrong column, and the tool that was supposed to create clarity
starts creating doubt.

Rebuilding the board on an interval does not fix it. Polling is slow enough to be
confusing, expensive enough to hurt at scale, and it still loses concurrent edits —
the last write wins by accident rather than by design.

---

## The solution

FlowSync treats the board as shared state with an explicit synchronisation protocol.

- Changes are pushed over WebSockets to the rooms that care about them, scoped to
  workspace, project and board.
- Sequence numbers let a client detect that it missed something and repair itself,
  rather than drifting quietly out of sync.
- Positions are computed server-side from relative intent ("between these two cards"),
  which makes simultaneous drops safe by construction.
- Optimistic updates keep the interface immediate, with rollback and a clear message
  when the server disagrees.
- Presence shows who else is on the board, so people can see the collision coming.

The result is a tool where two people can plan the same board at the same time, and
neither has to wonder whether they are looking at the current state.

---

## My role

Sole engineer — product decisions, architecture, implementation, testing, infrastructure
and documentation.

Specifically:

- Designed the domain model (21 entities) and the multi-tenant access model
- Designed and implemented the realtime protocol: envelopes, sequencing, de-duplication,
  echo suppression, resynchronisation, presence
- Implemented the fractional ranking algorithm and its concurrency behaviour
- Built the REST API with a guard chain covering identity, CSRF, tenancy, roles and
  rate limits
- Built the entire frontend, including the drag-and-drop board and the realtime cache layer
- Wrote every test: unit, integration against a real database, and two-browser end-to-end
- Containerised both applications and built the CI pipeline
- Wrote the architecture, security, decision and deployment documentation

---

## Key features

- Real-time Kanban with drag-and-drop between and within columns
- Live comments, notifications and presence
- Workspaces, projects, boards, columns, tasks, subtasks, labels, attachments
- Readable task identifiers with per-project prefixes
- Four-role RBAC with an explicit permission matrix
- Email invitations with single-use, hashed, expiring tokens
- Global search and a ⌘K command palette
- Activity feed and notification centre, cursor-paginated
- Combinable board filters and a bucketed "My Tasks" view
- Light, dark and system themes; keyboard navigable; usable on mobile
- One-click demo workspace for reviewers

---

## Technical challenges

**Keeping two clients in agreement.** Broadcasting changes is easy; guaranteeing a
client can tell the difference between "nothing happened" and "I missed something" is
not. Per-room sequence numbers plus gap detection turn an unreliable stream into one a
client can reason about, and resynchronisation becomes a deliberate, cheap operation
rather than an accident.

**Concurrent drops onto the same position.** The first implementation resolved the rank
before the transaction serialised, so parallel moves computed identical positions and
one lost to a unique constraint. Retrying inside the transaction could not work —
PostgreSQL aborts the whole transaction on a failed statement. The fix was to retry the
transaction as a unit and re-read the _current_ neighbour from the database on each
attempt, so the retry converges instead of recomputing the same collision. Concurrent
task creation had the same shape and was fixed by taking the project row lock first,
which serialises creates in a project as a side effect of minting the readable key.

**WebSocket authentication without a race.** Authenticating inside the connection
handler looked correct and was not: Socket.IO completes the client's `connect` event as
soon as the handshake succeeds, so a fast client could emit `subscribe` before an async
handler had finished resolving its identity — and be rejected as unauthenticated.
Moving authentication into handshake middleware closes the window, because nothing
reaches a message handler until `next()` is called.

**Not turning realtime into a refetch storm.** The obvious wiring — invalidate the
query when an event arrives — produces one network request per event and gets worse the
more collaborative the board is. Events instead apply surgical updates to the client
cache through pure reducer functions, which also made the ordering and de-duplication
rules straightforward to unit test.

**Proving tenant isolation rather than asserting it.** Isolation bugs hide in the paths
nobody thought about. The suite enumerates the whole resource surface — reads,
mutations, search, and socket subscriptions — from the perspective of a legitimate user
of a different workspace, and treats any response that is not `404` as a leak.

---

## Technologies

**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Radix UI, TanStack
Query, dnd-kit, React Hook Form, Zod, Zustand, date-fns, Socket.IO client

**Backend:** Node.js, NestJS 11, TypeScript, REST, Socket.IO, Prisma 6, Zod, Argon2id,
Pino, Multer, AWS SDK v3

**Data & infrastructure:** PostgreSQL 16, Redis 7, Docker, Docker Compose, GitHub
Actions, S3-compatible object storage

**Testing:** Jest, Supertest, Vitest, React Testing Library, Playwright

---

## Upwork skills

`Full Stack Development` · `SaaS Development` · `Real-Time Applications` · `WebSockets`
· `Socket.IO` · `React` · `Next.js` · `TypeScript` · `Node.js` · `NestJS` ·
`PostgreSQL` · `Prisma` · `Redis` · `REST API` · `API Development` · `Multi-Tenant
Architecture` · `Authentication & Authorization` · `RBAC` · `Web Application Security` ·
`Database Design` · `Docker` · `CI/CD` · `Automated Testing` · `Playwright` · `Jest` ·
`Tailwind CSS` · `UI/UX Implementation` · `Collaborative Software`

---

## GitHub description

> Real-time collaborative project management platform. Multi-tenant SaaS with Kanban
> boards that sync instantly across users — Next.js, NestJS, PostgreSQL, Redis,
> WebSockets, Docker. Fractional ranking, RBAC, tenant isolation, 167 tests.

**Topics:** `nextjs` `nestjs` `typescript` `websockets` `socket-io` `postgresql`
`prisma` `redis` `real-time` `collaboration` `kanban` `saas` `multi-tenant` `rbac`
`docker` `playwright` `full-stack`

---

## Demo video script (60–90 seconds)

Record at 1440×900, light theme, two browser windows side by side for the middle
section. No narration needed — captions carry it.

| Time      | On screen                                                                              | Caption                                                          |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0:00–0:06 | Landing page, scroll to the animated board preview                                     | _FlowSync — real-time collaborative project management_          |
| 0:06–0:12 | Click **Explore the demo workspace**, dashboard loads                                  | _One click into a populated workspace_                           |
| 0:12–0:20 | Dashboard: assigned work, overdue, recent activity                                     | _Workflow first — what needs you today_                          |
| 0:20–0:28 | Open Website Redesign, board renders                                                   | _Kanban with priorities, labels, due dates and subtask progress_ |
| 0:28–0:36 | Create a task, set priority Urgent, assign a member                                    | _Create, prioritise, assign_                                     |
| 0:36–0:50 | **Two windows side by side.** Drag a card from To Do to In Progress in the left window | _Now the point of the project_                                   |
| 0:50–0:56 | Hold on the right window showing the card land, then the presence indicator            | _No refresh. No polling. Both users, one board_                  |
| 0:56–1:06 | Left window: open the task, add a comment. Right window shows it appear                | _Comments arrive live_                                           |
| 1:06–1:12 | Right window: notification badge increments, open the notification centre              | _And so do notifications_                                        |
| 1:12–1:20 | Press ⌘K, type "authentication", open the result                                       | _⌘K to find anything_                                            |
| 1:20–1:26 | Resize to a phone viewport, scroll the board horizontally                              | _Works on mobile_                                                |
| 1:26–1:30 | Cut to the GitHub README, scroll past the architecture section                         | _Documented, tested, containerised_                              |

**Recording notes**

- Seed fresh (`npm run db:seed`) so the board matches the screenshots.
- Sign the two windows in as different people (Emma and Daniel) — the presence
  indicator and avatars only tell the story if the users are genuinely different.
- Use a normal drag speed. Rushing the drag is the one thing that makes the effect
  read as an edit rather than a sync.
- Keep the right-hand window still while dragging on the left, so it is obvious nobody
  touched it.

---

## Screenshot checklist

Capture at 1440×900 unless noted, in both light and dark where it adds anything.

1. **Landing page** — hero plus the animated board preview
2. **Dashboard** — stats, assigned work, recent activity
3. **Kanban board** — full board with cards, labels, avatars, presence indicator
4. **Task drawer** — description, assignees, labels, subtask progress, comments
5. **Two-user realtime** — two windows side by side, mid-move (the portfolio hero shot)
6. **Activity feed** — grouped by day
7. **Notification centre** — open popover with unread items
8. **Team page** — roster with roles and pending invitations
9. **Command palette** — ⌘K open with search results
10. **Mobile board** — 390×844, board scrolling horizontally
