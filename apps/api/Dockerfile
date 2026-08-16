# syntax=docker/dockerfile:1
#
# FlowSync API image. Built from the repository root so the workspace packages
# (`@flowsync/shared`) are available; `docker compose` sets that context already.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma and argon2 need these to build/run on Alpine.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts

# ---- build ------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

COPY packages ./packages
COPY apps/api ./apps/api

RUN npm run build --workspace @flowsync/shared \
 && npx --workspace @flowsync/api prisma generate \
 && npm run build --workspace @flowsync/api

# ---- seed -------------------------------------------------------------------
# Keeps the development dependencies (ts-node, Prisma CLI) so the demo workspace
# can be created with `docker compose --profile seed run --rm seed`.
FROM build AS seed
WORKDIR /app/apps/api
CMD ["npx", "prisma", "db", "seed"]

# ---- prune ------------------------------------------------------------------
FROM build AS prune
WORKDIR /app
RUN npm prune --omit=dev --workspace @flowsync/api --workspace @flowsync/shared

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl wget \
 && addgroup -g 1001 -S flowsync \
 && adduser -u 1001 -S flowsync -G flowsync

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/packages/shared/dist ./packages/shared/dist
COPY --from=prune /app/packages/shared/package.json ./packages/shared/
COPY --from=prune /app/apps/api/dist ./apps/api/dist
COPY --from=prune /app/apps/api/package.json ./apps/api/
COPY --from=prune /app/apps/api/prisma ./apps/api/prisma

# Uploads live outside the served tree and are streamed through an authorized route.
RUN mkdir -p /app/var/uploads && chown -R flowsync:flowsync /app/var

USER flowsync
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/health || exit 1

# Migrations are applied on boot so a fresh volume comes up ready.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
