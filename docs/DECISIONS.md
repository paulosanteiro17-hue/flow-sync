# Architecture Decision Record

Format: context → options considered → decision → consequences. Newest last.

---

### D-001 · Monorepo tooling: npm workspaces

**Context.** Two deployables plus shared contracts. The dev machine has npm 11 and no
pnpm; CI should not depend on a package manager the repo cannot bootstrap.

**Options.** (a) npm workspaces, (b) pnpm workspaces via corepack, (c) Turborepo on top
of either, (d) two independent repos.

**Decision.** npm workspaces, no build-orchestrator layer. Root scripts fan out with
`npm run <script> --workspace=<name>`.

**Consequences.** Zero extra tooling to install; `npm ci` works identically locally and
in GitHub Actions. We give up pnpm's disk savings and Turbo's task cache — acceptable at
four packages. Shared packages are consumed as TypeScript source through path aliases in
dev and compiled to `dist/` for production builds, so there is no watch-mode dance.

---

### D-002 · Backend framework: NestJS on Express

**Context.** The spec asks for REST + WebSockets + DTO validation + OpenAPI + guards.

**Options.** (a) NestJS + Express, (b) NestJS + Fastify, (c) Fastify alone, (d) Express alone.

**Decision.** NestJS on the Express platform.

**Consequences.** Guards/interceptors/DI map directly onto the RBAC and tenancy
requirements; `@nestjs/swagger` gives OpenAPI from the same decorators. Express (rather
than Fastify) because Socket.IO, `supertest` and the multipart middleware all have the
shortest, best-trodden path there; Fastify's throughput advantage is irrelevant at this
scale.

---

### D-003 · Validation: Zod in `packages/shared`, not `class-validator`

**Context.** NestJS defaults to `class-validator` DTOs, but the frontend needs the same
rules for React Hook Form.

**Decision.** One Zod schema per payload in `packages/shared`, consumed by a custom
`ZodValidationPipe` on the API and by `zodResolver` on the web app.

**Consequences.** A single source of truth for validation; no drift between client and
server rules. Cost: we hand-write `@ApiProperty`-equivalent metadata for OpenAPI via
`zod-to-json-schema` instead of getting it free from `class-validator` decorators.

---

### D-004 · Auth: httpOnly cookies with rotating refresh tokens

**Context.** The spec forbids sensitive tokens in `localStorage`.

**Options.** (a) NextAuth/Auth.js, (b) a session table with an opaque cookie,
(c) JWT access cookie + rotating refresh cookie.

**Decision.** (c). A 15-minute `fs_at` access JWT and a 30-day `fs_rt` refresh token,
both `httpOnly`, `Secure` in production. Refresh tokens are stored **hashed** (SHA-256)
in `RefreshToken` rows and rotated on every use; reuse of a consumed token revokes the
whole family (theft detection).

**Consequences.** No token is readable by JavaScript, so XSS cannot exfiltrate a session
directly. Logout and "revoke all sessions" work because refresh state is server-side.
Auth.js was rejected because it owns the session model and makes the Socket.IO handshake
and the non-Next.js API server awkward — this is a portfolio piece about backend
engineering, and hand-rolling the flow (carefully) is the point.

---

### D-005 · CSRF: double-submit token

**Context.** Cookie auth + an API that may run on a different origin than the web app in
production (`api.example.com` vs `app.example.com`) means `SameSite=Lax` alone is not a
sufficient defence once cookies must be `SameSite=None`.

**Decision.** A non-httpOnly `fs_csrf` cookie plus a mandatory `X-CSRF-Token` header on
every `POST/PATCH/PUT/DELETE`, compared in constant time. CORS is a strict origin
allowlist with credentials enabled. `SameSite` is `Lax` when web and API share a site
and `None; Secure` when they do not, driven by `COOKIE_SAMESITE`.

**Consequences.** Cross-origin deployment is safe and the same code path works in local
development. Every write from the client must go through the shared API client (which
attaches the header) — enforced by lint rule and by the client being the only exported
fetch wrapper.

---

### D-006 · Real-time transport: Socket.IO

**Options.** (a) raw `ws`, (b) Socket.IO, (c) SSE + POST, (d) a hosted service (Pusher/Ably).

**Decision.** Socket.IO 4.

**Consequences.** We get reconnection with exponential backoff, rooms, acknowledgements,
binary-safe payloads and `@socket.io/redis-adapter` for horizontal scaling — all of which
we would otherwise write and debug ourselves. SSE was rejected because presence and
client→server subscription messages want a duplex channel. A hosted service was rejected
because operating the realtime layer _is_ the thing this project demonstrates.

---

### D-007 · Task ordering: fractional lexicographic ranks

**Options.** (a) integer `position` with renumbering, (b) float midpoints,
(c) linked list (`prevId`/`nextId`), (d) LexoRank-style base-62 strings.

**Decision.** (d). See `ARCHITECTURE.md` §7.

**Consequences.** A move is a single-row update and a small realtime payload regardless
of board size. Float midpoints exhaust after ~50 insertions between the same pair;
integer positions turn one drag into `O(n)` writes; a linked list makes "render the
column in order" a recursive query. Cost: rank strings are opaque in the database and we
must own a rebalance routine (implemented, tested, and triggered by rank length).

---

### D-008 · Redis is required infrastructure, with a test-only in-memory fallback

**Context.** The spec warns against using Redis artificially.

**Decision.** Redis earns its place with four real jobs: Socket.IO horizontal scaling
(`@socket.io/redis-adapter`), presence sets with TTL, per-room realtime sequence
counters, and rate-limit counters. It is _not_ used as a general cache — Postgres is fast
enough for this workload and a cache layer would add invalidation bugs for no measured
gain. `RedisService` has an in-memory implementation selected by `REDIS_ENABLED=false`
so unit tests and a bare `npm run dev` do not require a broker.

**Consequences.** Multi-instance deployment works out of the box; single-instance local
development stays frictionless.

---

### D-009 · Presence: Redis sorted sets with heartbeat TTL

**Decision.** `presence:board:{id}` is a sorted set of `userId → lastSeenMs`. Sockets
heartbeat every 20s; members older than 45s are pruned on read and on a periodic sweep.
Presence changes are broadcast coalesced (at most one `presence.updated` per room per
second) rather than per socket event.

**Consequences.** Presence survives process restarts and multiple tabs per user, and a
crashed client disappears within one TTL window instead of lingering forever.

---

### D-010 · Client cache: TanStack Query as the only server-state store

**Decision.** Realtime events mutate the TanStack Query cache directly via
`setQueryData`. `invalidateQueries` is reserved for resync after a gap or reconnect.

**Consequences.** A burst of N events costs N in-memory cache writes and zero network
requests. The alternative (invalidate-on-event) would turn a busy board into a refetch
storm — the single most common mistake in "realtime" portfolio projects.

---

### D-011 · Conflict resolution: server-authoritative LWW with field-level patches

**Decision.** No CRDT. `PATCH` bodies carry only changed fields; moves send _relative_
position (`beforeTaskId`/`afterTaskId`) and the server computes the rank transactionally.

**Consequences.** Concurrent edits to different fields of the same task both survive.
Concurrent edits to the _same_ field resolve to the last writer, which is the correct and
expected behaviour for short structured fields. Concurrent drops onto the same slot
produce two distinct ranks instead of a collision. Documented as a deliberate limit:
simultaneous long-form description editing is last-write-wins and would need OT/CRDT to
do better.

---

### D-012 · Readable task ids: per-project counter in a transaction

**Decision.** `Project.taskCounter` is incremented inside the same transaction that
creates the task, producing `WEB-101`-style keys. The key is stored denormalised on the
task (`key` column, unique per workspace) so it is indexable and searchable.

**Consequences.** No gaps under normal operation, no race under concurrent creates
(the increment is atomic within the transaction). Cost: a per-project write hotspot,
irrelevant at this scale.

---

### D-013 · Attachments: authorized streaming, never static file serving

**Decision.** Uploaded files are stored outside the web root with generated keys and are
served exclusively through `GET /attachments/:id/download`, which re-checks task access
and sets `Content-Disposition: attachment` plus `X-Content-Type-Options: nosniff`.
Validation covers size, MIME sniffing against the declared type, an extension allowlist,
and filename sanitisation.

**Consequences.** No path traversal, no stored-XSS via an uploaded `.html`, no
unauthenticated object enumeration. Cost: downloads go through the API process; the S3
driver can issue short-lived signed URLs instead when `STORAGE_DRIVER=s3`.

---

### D-014 · Frontend rendering: static marketing, client-side app shell

**Decision.** `/` and the other marketing routes are statically rendered. Everything
under `/app` is a client component tree behind an auth check.

**Consequences.** The landing page is fast and SEO-friendly; the application avoids
double data fetching (RSC fetch + client cache hydration) for data that a socket is about
to mutate anyway. Auth-gating happens both in middleware (redirect) and on the API
(authoritative).

---

### D-015 · Testing strategy: real Postgres, no mocking of the ORM

**Decision.** Backend integration tests run against a real Postgres schema (`npx prisma
migrate deploy` against `DATABASE_URL_TEST`), with per-suite truncation. Prisma is never
mocked.

**Consequences.** Tenant isolation, cascade deletes, unique constraints and transaction
behaviour are actually exercised — mocking the ORM would test the mock. Cost: the backend
suite needs a database available; the frontend (Vitest) and shared-package suites do not.
