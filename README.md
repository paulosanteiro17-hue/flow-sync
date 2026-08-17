# FlowSync

**Real-time collaborative project management.** Kanban boards where a card moved by
one person lands on everyone else's screen immediately — no refresh, no polling.

<p align="center">
  <em>Move work forward, together.</em>
</p>

---

## What this is

FlowSync is a multi-tenant SaaS application: workspaces contain projects, projects
contain boards, boards contain columns and tasks. Several people work on the same
board at once and see each other's changes as they happen, along with who else is
looking at it.

It is a portfolio project, built to production standards rather than tutorial
standards: the interesting parts are the realtime protocol, the tenant isolation,
the ordering algorithm and the test suites that hold them in place.

## Demo workspace

Run the app locally and click **Explore the demo workspace** — one click signs you in
to a fully populated workspace (Northstar Labs: 6 people, 4 projects, 24 tasks) with
no form to fill in. A hosted deployment is not currently available.

> To see the point of the project: open the demo in two browser windows, put the same
> board side by side, and drag a card in one. It moves in the other.

Demo accounts (password `DemoFlow2024!`):

| Role   | Email                              |
| ------ | ---------------------------------- |
| Owner  | `emma.carter@northstarlabs.io`     |
| Admin  | `daniel.kim@northstarlabs.io`      |
| Member | `sophia.martinez@northstarlabs.io` |
| Guest  | `noah.bennett@contractor.dev`      |

Signing in as different roles is the fastest way to see the permission model: the
guest only sees one project and has no task-creation controls at all.

## Features

**Real-time collaboration**

- Task create/update/move/delete, comments, attachments and column changes broadcast
  to everyone on the board
- Presence: who else has this board open right now
- Notifications delivered live to the person they concern, wherever they are in the app
- Optimistic drag-and-drop with rollback and a clear message when the server disagrees

**Work management**

- Projects with statuses, colours, leads, members and their own task-key prefix
- Boards with configurable columns, WIP limits and completion columns
- Tasks with readable ids (`WEB-101`), priorities, labels, due dates, assignees,
  estimates, story points, subtask progress, comments and attachments
- Board filters that combine assignee, priority, label, due date and free text
- My Tasks bucketed by today / overdue / upcoming / completed
- Global search and a ⌘K command palette
- Activity feed recording every meaningful change, cursor-paginated

**Teams and access**

- Four workspace roles (Owner, Admin, Member, Guest) with an explicit permission matrix
- Invitations by email with single-use, hashed, expiring tokens
- Workspaces fully isolated from one another, enforced in the database query

**Craft**

- Light, dark and system themes
- Keyboard navigation, focus states, ARIA labelling, reduced-motion support
- Loading skeletons, empty states, error states with retry, offline indicator
- Usable on mobile, including the board

## Tech stack

| Layer              | Choice                                        | Why                                                                    |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| Web                | Next.js 16 (App Router), React 19, TypeScript | Static marketing pages, client-rendered realtime app                   |
| Styling            | Tailwind CSS 4, Radix primitives              | Design tokens in CSS, accessible behaviour without a component vendor  |
| Client state       | TanStack Query, Zustand                       | Query owns server state; Zustand only holds UI state                   |
| Drag & drop        | dnd-kit                                       | Pointer _and_ keyboard sensors, accessible announcements               |
| API                | NestJS 11 (Express), TypeScript               | Guards and DI map cleanly onto RBAC and tenancy                        |
| Realtime           | Socket.IO 4 + Redis adapter                   | Rooms, acknowledgements, reconnection, horizontal scaling              |
| Database           | PostgreSQL 16, Prisma 6                       | Relational domain, real migrations, typed access                       |
| Cache/coordination | Redis 7                                       | Presence, realtime sequencing, rate limiting, socket scaling           |
| Storage            | Local disk or any S3-compatible bucket        | One interface, driver chosen by configuration                          |
| Validation         | Zod, shared between client and server         | One schema, no drift                                                   |
| Tests              | Jest + Supertest, Vitest + RTL, Playwright    | Integration against a real database; realtime proven with two browsers |

## Architecture

```
apps/
  web/       Next.js application
  api/       NestJS REST API + Socket.IO gateway
packages/
  shared/    Zod schemas, DTO types, realtime contracts, RBAC matrix, ranking algorithm
  config/    Shared TypeScript configuration
docs/        Architecture, security, decisions, portfolio
scripts/     Development and smoke-test helpers
```

A modular monolith, deliberately. The domain is cohesive, transactions are small, and
one API process keeps the realtime layer simple. `packages/shared` is the contract:
the API validates with the same Zod schemas the web forms use, and both sides import
the same realtime event types, so a mismatch is a compile error rather than a
production incident.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Real-time design

Three problems separate "it works on my machine" from "it works":

1. **Ordering.** Every event carries a monotonic per-room sequence number. If a client
   receives `seq` higher than expected it knows it missed something, and refetches the
   board instead of applying an update on top of a state that no longer matches.
2. **Duplicates.** Every event carries a unique id; the client remembers the last few
   hundred per room. The socket that caused a change is also excluded from the
   broadcast, so an optimistic update is never clobbered by its own echo.
3. **Reconnection.** Socket.IO restores the transport; room membership and missed
   events are the application's job. On reconnect the client re-subscribes and
   resynchronises every room it was in.

Events patch the TanStack Query cache directly rather than invalidating it. A burst of
twenty events costs twenty in-memory writes and zero network requests — invalidating
instead is the single most common way these projects turn a busy board into a refetch
storm.

**Conflict strategy:** server-authoritative, last-write-wins per field. `PATCH` bodies
carry only changed fields, so two people editing different fields of one task both
win. Moves never send a position — the client names the neighbours it dropped between
and the server computes the rank inside a transaction, so two people dropping onto the
same slot at the same moment get two distinct, well-ordered positions instead of a
collision. Full CRDT convergence is a documented non-goal.

### Task ordering

Positions are fractional lexicographic rank strings (LexoRank-style, base 62), not
integers:

```
insert between "a1" and "a3"  ->  "a2"
insert between "a1" and "a2"  ->  "a1V"
```

A move is one row update and a tiny realtime payload no matter how large the board is.
Integer positions would rewrite every row below the insertion point; float midpoints
run out of precision after about fifty insertions into the same gap. Rank strings grow
slowly instead, and a column is rebalanced automatically when one gets long — which the
test suite proves by performing sixty consecutive drops into the same gap.

### Database

21 models with foreign keys, cascade rules, composite unique constraints
(`(columnId, rank)`, `(workspaceId, key)`, `(projectId, number)`) and indexes on every
tenant-scoped access path. Readable task keys are minted inside the creating
transaction, which takes a row lock on the project — that is what makes concurrent
creation gap-free and collision-free.

Schema: [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma).

### Multi-tenancy

Every tenant-owned row carries `workspaceId`, and every tenant-scoped route is nested
under `/workspaces/:workspaceId/...`, which makes the boundary visible in the URL and
reduces the check to one indexed lookup. Deep resources are resolved **joined to the
caller's membership** — there is no code path that loads a task by id and checks
ownership afterwards.

Non-membership returns `404`, never `403`: a `403` would confirm that the resource
exists. The behaviour is enforced by a dedicated suite that walks fifteen read
endpoints and every mutation as a member of a different workspace.

## Getting started

### Requirements

- Node.js 20.11+ (22 recommended)
- Docker (for Postgres and Redis), or your own Postgres 16 and Redis 7

### Quick start

```bash
git clone https://github.com/paulosanteiro17-hue/flow-sync.git flowsync
cd flowsync
npm install

cp .env.example .env
# Generate a secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# ...and paste it into JWT_SECRET

docker compose up -d postgres redis

npm run db:deploy      # apply migrations
npm run db:seed        # create the Northstar Labs demo workspace

npm run dev            # api on :4000, web on :3000
```

Open <http://localhost:3000> and click **Explore the demo workspace**.

### Everything in Docker

```bash
cp .env.example .env   # set JWT_SECRET
docker compose up -d --build
docker compose --profile seed run --rm seed
```

Web on <http://localhost:3000>, API on <http://localhost:4000>. Ports are configurable
through `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` and `REDIS_PORT` if something else on
your machine already uses them.

### Environment

Every variable is documented in [`.env.example`](.env.example). The API validates its
configuration at boot with Zod and refuses to start on a bad value rather than failing
later. Notable ones:

| Variable          | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `JWT_SECRET`      | Signing key. Must be 32+ characters in production.                                |
| `WEB_ORIGIN`      | Comma-separated CORS allowlist. Also decides whether secure cookies are required. |
| `COOKIE_SAMESITE` | `lax` when web and API share a site, `none` for split origins.                    |
| `REDIS_ENABLED`   | `false` runs single-instance with in-process equivalents.                         |
| `STORAGE_DRIVER`  | `local` or `s3` (works with AWS S3, Cloudflare R2, MinIO).                        |
| `DEMO_ENABLED`    | Enables the one-click demo entry point.                                           |

## Testing

Nothing here is asserted without being run.

```bash
npm test               # shared + web unit, then API integration
npm run test:shared    # ranking algorithm, RBAC matrix, formatting helpers
npm run test:web       # board cache reducers, filters, task card
npm run test:api       # integration suite against a real Postgres
npm run test:e2e       # Playwright, starts both servers itself
```

The API suite needs a test database once:

```bash
npm run db:test:setup --workspace @flowsync/api
```

| Suite                         | Count | What it covers                                                                                                                                                                            |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` (Vitest)    | 39    | Ranking invariants under 500 same-gap and 300 random insertions, permission matrix, mention parsing, activity messages                                                                    |
| `apps/web` (Vitest + RTL)     | 34    | Board cache reducers, realtime sequencing, optimistic move, filter combinations, task card behaviour and accessibility                                                                    |
| `apps/api` (Jest + Supertest) | 76    | Auth, CSRF, refresh reuse detection, RBAC for all four roles, tenant isolation, ordering under concurrency, rank rebalancing, WebSocket authorization, rate limiting                      |
| `apps/web/e2e` (Playwright)   | 28    | Sign up → workspace → project → task → comment, filters, palette, permissions, mobile drawer and board, and **two browser contexts proving a card moved by one user appears for another** |

Prisma is never mocked. Tenant isolation, cascade deletes, unique constraints and
transaction behaviour only exist in the database, so the integration tests run against
a real schema.

## API

REST, cookie-authenticated, OpenAPI at `/api/docs` in non-production builds.

```
/auth                          sign-up · sign-in · sign-out · refresh · me · demo · password reset
/users/me                      profile · preferences
/workspaces                    list · create
/workspaces/:id                get · update · delete · leave · transfer-ownership
  /members                     roster · role changes · removal
  /invitations                 create · list · revoke
  /labels                      workspace label palette
  /projects[/:id]              CRUD · members
  /projects/:id/boards         list · create
  /boards/:id                  full snapshot (columns + tasks + realtime sequence)
  /columns/:id                 update · move · delete
  /tasks[/:id]                 CRUD · move · subtasks
  /tasks/:id/comments          list · create
  /tasks/:id/attachments       list · upload
  /comments/:id                update · delete
  /attachments/:id             download · delete
  /notifications               list · read · read-all
  /activity                    cursor-paginated feed
  /search                      projects · tasks · members · comments
  /dashboard                   everything the dashboard needs in one request
/invitations/:token            preview (public) · accept
/health, /health/ready         probes
```

Unbounded collections (activity, notifications, comments) use cursor pagination —
offset pagination drifts when rows are inserted while a user is paging, which is the
normal case in a realtime app.

## Security

The full model and its threat reasoning: [`docs/SECURITY.md`](docs/SECURITY.md).

- **Passwords** hashed with Argon2id at the OWASP 2024 baseline. Breached-password
  rejection. Sign-in spends the same time on an unknown account as on a wrong password,
  so it cannot be used to enumerate users.
- **Sessions** in `httpOnly` cookies — no token is reachable from JavaScript. Refresh
  tokens are stored hashed and rotate on every use; replaying a consumed token is
  treated as theft and revokes the whole family.
- **CSRF** via double-submit token, enforced globally on every state-changing verb and
  compared in constant time.
- **Authorization** enforced server-side in the query that loads the resource. The UI
  reads the same permission matrix, but only to decide what to render.
- **Uploads** validated on size, extension, MIME type and magic bytes; stored under
  generated keys outside any served directory; delivered only through an authorized
  route with `Content-Disposition: attachment` and `nosniff`.
- **WebSockets** authenticated during the handshake from the same cookie, with every
  room subscription re-checked in the database.
- **Rate limiting** on sign-in, sign-up, password reset, invitations, comments, search,
  uploads and socket connections.
- **Errors** are structured and carry a request id; stack traces and ORM internals
  never reach the client. Logs redact credentials and tokens.

## Deployment

Vendor-neutral — the app is two Docker images plus Postgres and Redis. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a walkthrough covering Vercel + Railway,
Fly.io, and a single-VPS compose setup, plus the production environment matrix and the
cross-origin cookie configuration.

## Documentation

| Document                                       | Contents                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, realtime protocol, ranking, data model, module map   |
| [`docs/SECURITY.md`](docs/SECURITY.md)         | Threat model, permission matrix, controls and the tests behind them |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | Every significant decision with the alternatives considered         |
| [`docs/PLAN.md`](docs/PLAN.md)                 | Delivery plan, phase status, risk register                          |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)     | Deployment options and production configuration                     |
| [`docs/PORTFOLIO.md`](docs/PORTFOLIO.md)       | Case study and demo script                                          |

## Future improvements

Deliberately out of scope for this build, with the architecture left ready for them:

- Calendar and timeline (Gantt) views over the existing task model
- Recurring tasks and time tracking
- Full-text search using a Postgres `tsvector` column (the search service is already
  the single place that would change)
- Email delivery — `MailerService` is an interface with a console transport; a provider
  is an implementation, not a refactor
- Webhooks and a public API, using the existing activity events as the source
- Collaborative rich-text descriptions, which would need CRDT/OT rather than the
  current last-write-wins
- Offline mode and a mobile client
- Slack, GitHub and Google Calendar integrations

## License

[MIT](LICENSE).
