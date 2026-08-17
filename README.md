# FlowSync

**Real-time collaborative project management.** Move a card once and everyone on the
board sees it immediately — no refresh and no polling.

![FlowSync landing page and board preview](https://github.com/paulosanteiro17-hue/flow-sync/releases/download/v1.0.0/flowsync-overview.png)

FlowSync is a multi-tenant SaaS portfolio project built around live collaboration,
secure workspace isolation and a polished kanban workflow. The demo workspace comes
populated with projects, people and tasks so the product can be explored immediately.

> A hosted deployment is not currently available. Run it locally and select
> **Explore the demo workspace**.

## Highlights

- Live task, comment, attachment, column and notification updates with Socket.IO
- Presence indicators and automatic recovery from missed or duplicated events
- Optimistic drag-and-drop with server-authoritative ordering and rollback
- Projects, boards, filters, search, command palette, activity feed and My Tasks
- Owner, Admin, Member and Guest roles with server-side tenant isolation
- Light, dark and system themes, keyboard navigation and responsive layouts
- Cookie authentication, CSRF protection, rotating refresh tokens and rate limiting

## Product

![FlowSync kanban board](https://github.com/paulosanteiro17-hue/flow-sync/releases/download/v1.0.0/flowsync-board.png)

The seeded **Northstar Labs** workspace includes four projects and 24 tasks. Open the
same board in two browser windows and move a card to see the real-time flow in action.

## Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Web          | Next.js 16, React 19, TypeScript, Tailwind CSS 4     |
| API          | NestJS 11, Express, Socket.IO                        |
| Data         | PostgreSQL 16, Prisma 6, Redis 7                     |
| Client state | TanStack Query, Zustand, dnd-kit                     |
| Validation   | Shared Zod schemas                                   |
| Tests        | Vitest, Testing Library, Jest, Supertest, Playwright |
| Delivery     | Docker, Docker Compose, GitHub Actions               |

## Architecture

```text
apps/
  web/       Next.js application
  api/       NestJS REST API and Socket.IO gateway
packages/
  shared/    Schemas, DTOs, RBAC, ranking and realtime contracts
  config/    Shared TypeScript configuration
docs/        Architecture, security and deployment notes
```

Every board event carries a monotonic room sequence and a unique event id. Clients
detect gaps, ignore duplicates and resynchronise after reconnecting. Task positions
use fractional lexicographic ranks, so moving a card updates one row instead of
renumbering an entire column.

See [Architecture](docs/ARCHITECTURE.md) for the complete design.

## Run locally

Requirements: Node.js 20.11+ (22 recommended), Docker, PostgreSQL 16 and Redis 7.

```bash
git clone https://github.com/paulosanteiro17-hue/flow-sync.git flowsync
cd flowsync
npm install

cp .env.example .env
# Set JWT_SECRET in .env to a random value with at least 32 characters.

docker compose up -d postgres redis
npm run db:deploy
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The API runs on <http://localhost:4000> and exposes
OpenAPI documentation at `/api/docs` outside production.

To run everything in containers:

```bash
cp .env.example .env
docker compose up -d --build
docker compose --profile seed run --rm seed
```

All configuration options are documented in [`.env.example`](.env.example).

## Demo accounts

All demo users share the password `DemoFlow2024!`.

| Role   | Email                              |
| ------ | ---------------------------------- |
| Owner  | `emma.carter@northstarlabs.io`     |
| Admin  | `daniel.kim@northstarlabs.io`      |
| Member | `sophia.martinez@northstarlabs.io` |
| Guest  | `noah.bennett@contractor.dev`      |

## Quality

| Suite  | Tests | Focus                                               |
| ------ | ----: | --------------------------------------------------- |
| Shared |    39 | Ranking, permissions and helpers                    |
| Web    |    34 | Realtime cache, filters and UI behaviour            |
| API    |    76 | Auth, RBAC, tenancy, ordering and WebSockets        |
| E2E    |    28 | Complete workflows, mobile and two-browser realtime |

```bash
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

The GitHub Actions pipeline also builds both Docker images and audits production
dependencies.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Technical decisions](docs/DECISIONS.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Portfolio case study](docs/PORTFOLIO.md)

## License

[MIT](LICENSE)
