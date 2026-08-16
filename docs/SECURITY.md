# FlowSync — Security Model & Review

This document is both the threat model and the checklist executed during the security
review phase. Every control below is implemented in code and, where marked, covered by
an automated test.

## 1. Authentication

| Control                 | Implementation                                                                                                 | Test               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| Password hashing        | Argon2id (`argon2`), memory 19 MiB / time 2 / parallelism 1 — OWASP 2024 baseline                              | `auth.e2e-spec.ts` |
| Password policy         | min 10 chars, rejects the top-N breached list shipped in `packages/shared`                                     | ✅                 |
| Access token            | JWT HS256, 15 min TTL, `httpOnly` `fs_at` cookie, never in JS-readable storage                                 | ✅                 |
| Refresh token           | 30 day TTL, opaque 32-byte random, stored SHA-256-hashed, rotated on every use                                 | ✅                 |
| Refresh reuse detection | replaying a consumed token revokes the entire token family                                                     | ✅                 |
| Sign-out                | deletes the refresh row and clears all auth cookies                                                            | ✅                 |
| Timing                  | sign-in performs a dummy hash verification for unknown emails (no user enumeration)                            | ✅                 |
| Password reset          | architecture in place (`PasswordResetToken`, hashed, single-use, 1 h TTL) with a console mailer in development | ✅                 |

## 2. Session & transport

- Cookies: `httpOnly`, `Secure` in production, `SameSite` driven by `COOKIE_SAMESITE`
  (`lax` for same-site deployments, `none` for split origins), `Path=/`, explicit `Max-Age`.
- CSRF: double-submit token (`fs_csrf` cookie + `X-CSRF-Token` header) enforced by a
  global guard on every state-changing verb; comparison is constant-time.
- CORS: strict origin allowlist from `WEB_ORIGIN`, `credentials: true`, explicit method
  and header allowlists. No wildcard is ever combined with credentials.
- Helmet sets HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frameguard and a CSP
  for API responses.

## 3. Authorization & tenancy

- Four workspace roles with an explicit permission matrix (below).
- Guard chain: `JwtCookieGuard → CsrfGuard → WorkspaceContextGuard → RolesGuard`.
- **Non-membership returns `404`, not `403`**, so resource existence is not leakable.
- Every deep resource lookup joins to the workspace in the same query; there is no
  "fetch then check" path.
- Dedicated suite `tenant-isolation.e2e-spec.ts` proves a member of workspace B cannot
  read, mutate or subscribe to any resource of workspace A.

### Permission matrix

| Action                                | Owner |     Admin      |  Member  | Guest |
| ------------------------------------- | :---: | :------------: | :------: | :---: |
| View projects they are a member of    |  ✅   |       ✅       |    ✅    |  ✅   |
| View all workspace projects           |  ✅   |       ✅       |    ✅    |  ❌   |
| Create / edit project                 |  ✅   |       ✅       |    ❌    |  ❌   |
| Archive / delete project              |  ✅   |       ✅       |    ❌    |  ❌   |
| Manage project members                |  ✅   |       ✅       |    ❌    |  ❌   |
| Create board / column, reorder        |  ✅   |       ✅       |    ✅    |  ❌   |
| Create / edit / move task             |  ✅   |       ✅       |    ✅    |  ❌   |
| Delete task                           |  ✅   |       ✅       | ✅ (own) |  ❌   |
| Comment                               |  ✅   |       ✅       |    ✅    |  ✅   |
| Edit / delete own comment             |  ✅   |       ✅       |    ✅    |  ✅   |
| Delete any comment                    |  ✅   |       ✅       |    ❌    |  ❌   |
| Upload attachment                     |  ✅   |       ✅       |    ✅    |  ❌   |
| Invite member                         |  ✅   |       ✅       |    ❌    |  ❌   |
| Change member role                    |  ✅   | ✅ (below own) |    ❌    |  ❌   |
| Remove member                         |  ✅   | ✅ (not Owner) |    ❌    |  ❌   |
| Edit workspace settings               |  ✅   |       ✅       |    ❌    |  ❌   |
| Transfer ownership / delete workspace |  ✅   |       ❌       |    ❌    |  ❌   |

Invariant: a workspace always has at least one Owner; the last Owner can neither be
demoted nor removed.

## 4. Input handling

- Every request body, query and param is parsed by a Zod schema before it reaches a
  service. Unknown keys are stripped (`.strict()` where mass assignment matters).
- SQL injection: all database access goes through Prisma's parameterised query builder.
  There is exactly one raw query in the codebase (full-text search ranking); it uses
  `Prisma.sql` tagged-template parameter binding, never string concatenation.
- XSS: React escapes by default and the codebase contains no `dangerouslySetInnerHTML`.
  Comment bodies are stored as plain text and rendered as text; @mentions are resolved
  from stored user ids, not from the rendered string.
- Mass assignment: DTOs whitelist fields; `role`, `workspaceId`, `creatorId`, `key` and
  `rank` are never accepted from the client.

## 5. File uploads

- Size cap (`UPLOAD_MAX_BYTES`, default 10 MiB) enforced by multer _and_ re-checked.
- Extension allowlist + MIME allowlist + magic-byte sniffing; a mismatch is rejected.
- Filenames are sanitised for display and **never** used as storage keys — keys are
  `{workspaceId}/{taskId}/{uuid}{ext}`, so path traversal is structurally impossible.
- Files are stored outside any statically served directory and delivered only through an
  authorized endpoint with `Content-Disposition: attachment` and `nosniff`.
- SVG and HTML are not in the allowlist (stored-XSS vector).

## 6. Rate limiting

Redis-backed sliding window, keyed by IP + route, with tighter per-user buckets on
authenticated routes.

| Bucket                 | Limit                                             |
| ---------------------- | ------------------------------------------------- |
| Sign in                | 5 / 15 min per IP+email, plus exponential lockout |
| Sign up                | 10 / hour per IP                                  |
| Password reset request | 5 / hour per IP+email                             |
| Invitations            | 30 / hour per workspace                           |
| Comments               | 60 / min per user                                 |
| Search                 | 60 / min per user                                 |
| Uploads                | 30 / hour per user                                |
| WebSocket connections  | 20 / min per IP                                   |
| Global API             | 300 / min per user                                |

## 7. WebSocket security

- Handshake authenticated from the httpOnly cookie; no token in the query string.
- Origin check on the handshake against the CORS allowlist.
- Every `subscribe:*` message re-validates access in the database before `join()`.
- Emissions are always room-scoped; there is no broadcast-to-all code path.
- Payloads carry only data the room is already entitled to see.
- A socket that fails authorization is disconnected, and repeated failures trip the
  connection rate limit.

## 8. Invitation tokens

- 32 bytes from `crypto.randomBytes`, delivered once, stored SHA-256-hashed.
- Single-use, 7-day expiry, bound to the invited email address and workspace.
- Accepting requires being signed in as the invited email; a mismatch is rejected.
- Revocation deletes the row, immediately invalidating the outstanding link.

## 9. Secrets & configuration

- All configuration goes through a Zod-validated env schema; the API refuses to boot
  with a missing or weak secret (`JWT_SECRET` shorter than 32 chars is fatal in production).
- `.env.example` documents every variable and contains no real values.
- `.env*` files are git-ignored. No secret is committed, logged or returned in a response.

## 10. Error handling & logging

- A global exception filter returns a structured `{ statusCode, message, code, requestId }`
  body. Stack traces and Prisma error internals never reach the client in production.
- Pino structured logs with a redaction list covering `password`, `token`, `authorization`,
  `cookie`, `secret`, `refreshToken`.
- Unhandled errors are logged with the `requestId` echoed to the client, so a user can
  report an error without the server leaking internals.

## 11. Dependency security

- `npm audit --omit=dev` runs in CI and fails the build on high/critical findings.
- Dependencies are pinned by `package-lock.json`; `npm ci` is used everywhere.

## 12. Review log

Phase 21 walked every section above against the running system. Findings and their
resolutions:

| #   | Finding                                                                                                                                                                                                                                                              | Severity   | Resolution                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WebSocket authentication ran in `handleConnection`, which is async. Socket.IO completes the client's `connect` event as soon as the handshake succeeds, so a fast client could emit `subscribe` before its identity was resolved and be rejected as unauthenticated. | High       | Authentication moved into handshake middleware; nothing reaches a message handler until `next()` has been called. Covered by `realtime.e2e-spec.ts`. |
| 2   | `docker compose up` refused to boot because `NODE_ENV=production` demanded `COOKIE_SECURE`, which is wrong for a local stack over plain HTTP — the kind of friction that gets a control disabled wholesale.                                                          | Medium     | The requirement keys off an `https://` origin in `WEB_ORIGIN`, so a real TLS deployment still cannot ship insecure cookies while localhost works.    |
| 3   | The mobile navigation drawer was moved off-canvas with `translate` alone, leaving its links in the accessibility tree and the tab order while invisible to sighted users.                                                                                            | Low (a11y) | The drawer is `invisible` below the `lg` breakpoint. Asserted in `mobile.spec.ts`.                                                                   |
| 4   | The drawer backdrop and its close button shared the accessible name "Close navigation".                                                                                                                                                                              | Low (a11y) | The backdrop is decorative (`aria-hidden`); Escape closes the drawer for keyboard users.                                                             |
| 5   | `rankBetween` validated rank characters lazily, so an invalid character after the first differing position was never inspected. Not reachable from user input, but it weakened an invariant the ordering depends on.                                                 | Low        | Inputs are validated up front. Covered in `packages/shared/src/rank.test.ts`.                                                                        |

Checks that passed with no change required:

- Sign-in answers identically for a wrong password and an unknown account, and spends
  the same time on both (`auth.e2e-spec.ts`).
- Refresh-token replay revokes the whole family, so a stolen cookie cannot be reused.
- Every cross-tenant read and mutation returns `404`, including through search and
  socket subscriptions (`tenant-isolation.e2e-spec.ts`: 15 read endpoints plus all writes).
- No route trusts a client-supplied `workspaceId`, `role`, `creatorId`, `key` or `rank`.
- The only raw SQL in the codebase is the test-only `TRUNCATE`, which refuses to run
  outside `NODE_ENV=test`.
- No `dangerouslySetInnerHTML` anywhere; comment bodies are stored and rendered as text.
- Error responses carry a request id and no stack traces or ORM internals.
- `npm audit --omit=dev --audit-level=high` reports no advisories, and runs in CI.

Known and accepted limitations, documented rather than hidden:

- Email uses a console transport in this build. Invitation and reset links are printed
  to the API log — correct for a portfolio deployment, and a provider implementation
  rather than a refactor in production.
- Simultaneous editing of a long task description is last-write-wins. Doing better needs
  CRDT/OT and is listed as a non-goal in `PLAN.md`.
- Rate-limit buckets are per instance unless Redis is enabled. `REDIS_ENABLED=true` is
  required for any multi-instance deployment and is called out in `docs/DEPLOYMENT.md`.
