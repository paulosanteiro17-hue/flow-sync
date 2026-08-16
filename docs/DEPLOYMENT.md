# Deployment

FlowSync is two Docker images plus PostgreSQL and Redis. Nothing is tied to a specific
provider: the only vendor-shaped decisions are which managed database you point
`DATABASE_URL` at and where the two images run.

## 1. What has to be true

| Requirement                                   | Why                                                          |
| --------------------------------------------- | ------------------------------------------------------------ |
| PostgreSQL 16 reachable from the API          | Primary datastore                                            |
| Redis 7 reachable from the API                | Presence, realtime sequencing, rate limiting, socket scaling |
| The API reachable from the browser over HTTPS | Cookies are `Secure` in any HTTPS deployment                 |
| WebSocket upgrades allowed on the API host    | The realtime layer is the product                            |
| `JWT_SECRET` of 32+ characters                | Enforced at boot; the process refuses to start otherwise     |

If you run more than one API instance, Redis is mandatory rather than optional — it is
what carries events between them.

## 2. Cookies and origins

This is the configuration people get wrong, so it is worth being explicit.

**Same site** (`app.example.com` and `api.example.com` share `example.com`, or both are
behind one domain with a path prefix):

```env
WEB_ORIGIN=https://app.example.com
COOKIE_SAMESITE=lax
COOKIE_SECURE=true
COOKIE_DOMAIN=.example.com
```

**Split origins** (`flowsync.vercel.app` and `flowsync-api.up.railway.app`):

```env
WEB_ORIGIN=https://flowsync.vercel.app
COOKIE_SAMESITE=none
COOKIE_SECURE=true
# no COOKIE_DOMAIN
```

`SameSite=None` requires `Secure`, and the API validates that combination at boot.
Cross-site cookies are why the CSRF double-submit token exists rather than relying on
`SameSite` alone.

`WEB_ORIGIN` doubles as the CORS allowlist and accepts a comma-separated list, which is
how you allow a preview deployment alongside production.

## 3. Option A — Vercel (web) + Railway (API, Postgres, Redis)

The quickest path, and the one the demo uses.

**Database and cache.** In a Railway project, add PostgreSQL and Redis plugins. Copy
their connection strings.

**API.** Add a service from the repository:

- Root directory: repository root
- Dockerfile path: `apps/api/Dockerfile`
- Variables:

```env
NODE_ENV=production
PORT=4000
API_URL=https://<api-domain>
WEB_ORIGIN=https://<web-domain>
DATABASE_URL=<railway postgres url>
REDIS_ENABLED=true
REDIS_URL=<railway redis url>
JWT_SECRET=<48 random bytes, base64url>
COOKIE_SAMESITE=none
COOKIE_SECURE=true
STORAGE_DRIVER=s3
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
DEMO_ENABLED=true
```

The image runs `prisma migrate deploy` before starting, so a deploy applies pending
migrations. Seed the demo workspace once:

```bash
railway run --service api npx prisma db seed
```

**Web.** Import the repository into Vercel:

- Root directory: `apps/web`
- Install command: `npm install --prefix ../..`
- Build command: `npm run build --workspace @flowsync/shared --prefix ../.. && next build`
- Environment: `NEXT_PUBLIC_API_URL=https://<api-domain>`

`NEXT_PUBLIC_API_URL` is baked into the client bundle at build time — changing it
requires a rebuild, not just a restart.

## 4. Option B — Fly.io (both apps)

Two Fly apps sharing a Fly Postgres and an Upstash Redis.

```bash
fly launch --dockerfile apps/api/Dockerfile --name flowsync-api --no-deploy
fly postgres create --name flowsync-db
fly postgres attach flowsync-db --app flowsync-api
fly redis create --name flowsync-redis
fly secrets set --app flowsync-api \
  JWT_SECRET=... REDIS_ENABLED=true REDIS_URL=... \
  WEB_ORIGIN=https://flowsync-web.fly.dev COOKIE_SAMESITE=none COOKIE_SECURE=true
fly deploy --app flowsync-api

fly launch --dockerfile apps/web/Dockerfile --name flowsync-web --no-deploy
fly deploy --app flowsync-web \
  --build-arg NEXT_PUBLIC_API_URL=https://flowsync-api.fly.dev
```

Fly proxies WebSockets without extra configuration. Set `min_machines_running = 1` on
the API so sockets are not dropped by scale-to-zero.

## 5. Option C — One VPS with Docker Compose

Cheapest, and closest to the local setup.

```bash
git clone <repository-url> /opt/flowsync && cd /opt/flowsync
cp .env.example .env      # set JWT_SECRET, API_URL, WEB_ORIGIN to your domains
docker compose up -d --build
docker compose --profile seed run --rm seed
```

Put a TLS terminator in front (Caddy is two lines):

```caddy
app.example.com {
  reverse_proxy localhost:3000
}

api.example.com {
  reverse_proxy localhost:4000
}
```

Caddy forwards WebSocket upgrades by default. With nginx, remember
`proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`
on the API location, or the realtime layer silently falls back to polling.

Then set `COOKIE_DOMAIN=.example.com`, `COOKIE_SAMESITE=lax`, `COOKIE_SECURE=true`.

## 6. Storage

`STORAGE_DRIVER=local` keeps uploads on the API's disk, which is fine for a single VPS
with a volume and wrong for anything that redeploys onto fresh containers. For hosted
deployments use `s3`, which works with AWS S3, Cloudflare R2 and MinIO:

```env
STORAGE_DRIVER=s3
S3_BUCKET=flowsync-uploads
S3_REGION=auto
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # R2/MinIO only
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Keep the bucket private. Downloads are streamed through an authorized API route, so the
bucket never needs to be publicly readable.

## 7. Migrations

The API image runs `prisma migrate deploy` on start, so a rolling deploy applies
migrations once and the other instances find nothing to do. For a large migration,
apply it out of band first:

```bash
DATABASE_URL=<production url> npx prisma migrate deploy
```

Migrations are additive and reviewed; `prisma migrate reset` exists for development
only and refuses to run against a non-test database in this project.

## 8. Health and observability

| Endpoint            | Meaning                                          |
| ------------------- | ------------------------------------------------ |
| `GET /health`       | Process is alive. Use for liveness.              |
| `GET /health/ready` | Database and Redis reachable. Use for readiness. |

Logs are structured JSON (Pino) with `requestId`, `userId`, `workspaceId`, route and
duration, and a redaction list covering cookies, tokens and passwords. Point them at
whatever aggregator you use; the `requestId` is echoed to clients in error bodies, so a
user-reported error maps to a log line directly.

## 9. Scaling

The API is stateless apart from Redis. To run more than one instance:

1. Set `REDIS_ENABLED=true` with a shared Redis — the Socket.IO Redis adapter carries
   events between instances, and presence and rate limits become global rather than
   per-process.
2. Enable sticky sessions **only** if you allow the HTTP long-polling transport. With
   `transports: ['websocket']` alone it is unnecessary.
3. Scale Postgres connections with `?connection_limit=` on `DATABASE_URL`, or put
   PgBouncer in front for serverless-style scaling.

## 10. Pre-flight checklist

- [ ] `JWT_SECRET` is 32+ random characters and unique to this environment
- [ ] `WEB_ORIGIN` lists exactly the origins that should reach the API
- [ ] `COOKIE_SECURE=true` and `COOKIE_SAMESITE` matches your origin topology
- [ ] `REDIS_ENABLED=true` if more than one API instance runs
- [ ] `STORAGE_DRIVER=s3` unless the disk is genuinely persistent
- [ ] `NEXT_PUBLIC_API_URL` points at the public API URL and the web app was rebuilt
- [ ] WebSocket upgrades pass through every proxy in front of the API
- [ ] `GET /health/ready` returns `{"status":"ok"}`
- [ ] Two browsers on one board show each other's moves
- [ ] `DEMO_ENABLED` is set the way you want it for a public deployment
