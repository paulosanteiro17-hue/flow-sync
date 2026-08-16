# syntax=docker/dockerfile:1
#
# FlowSync web image, using Next.js standalone output so the runtime layer stays
# small. Built from the repository root for access to `@flowsync/shared`.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts

# ---- build ------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

# Baked into the client bundle at build time, so it must be known here.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_TRACING_ROOT=/app

COPY packages ./packages
COPY apps/web ./apps/web

RUN npm run build --workspace @flowsync/shared \
 && npm run build --workspace @flowsync/web

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache wget \
 && addgroup -g 1001 -S flowsync \
 && adduser -u 1001 -S flowsync -G flowsync

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=flowsync:flowsync /app/apps/web/.next/standalone ./
COPY --from=build --chown=flowsync:flowsync /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=flowsync:flowsync /app/apps/web/public ./apps/web/public

USER flowsync
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
