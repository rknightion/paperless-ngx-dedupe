# Stage 1: Install dependencies
FROM node:24-slim AS deps

WORKDIR /app

RUN corepack enable

ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/cli/package.json ./packages/cli/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build

COPY . .

RUN pnpm --filter @paperless-dedupe/core build && pnpm --filter @paperless-dedupe/web build

# Create standalone deployment with flat node_modules (no pnpm symlinks)
RUN pnpm --filter @paperless-dedupe/web deploy --legacy --prod /app/deployed

# Bundle CLI into a single file (resolves TS source + all non-native deps)
RUN pnpm dlx esbuild packages/cli/src/bin.ts \
  --bundle --platform=node --format=esm \
  --outfile=/app/cli-bundle/paperless-ngx-dedupe.mjs \
  --external:better-sqlite3 \
  --external:pino \
  --external:pino-pretty \
  --banner:js='import{createRequire as _cr}from"module";const require=_cr(import.meta.url);'

# Stage 3: Production runtime
FROM node:24-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini gosu curl && rm -rf /var/lib/apt/lists/*

# Copy production deps from pnpm deploy (flat node_modules, no symlinks)
COPY --from=build /app/deployed/node_modules ./node_modules

# Copy SvelteKit build output
COPY --from=build /app/packages/web/build ./build
COPY --from=build /app/package.json ./

# Copy pre-compiled core package (worker threads run outside SvelteKit's bundle)
COPY --from=build /app/packages/core/dist ./core

# Copy bundled CLI (uses node_modules for native deps like better-sqlite3)
COPY --from=build /app/cli-bundle/paperless-ngx-dedupe.mjs ./cli/paperless-ngx-dedupe.mjs

# Copy OTEL preload script (loaded via --require when OTEL_ENABLED=true)
COPY --from=build /app/packages/web/telemetry.cjs ./telemetry.cjs

# Create data directory and CLI wrapper
RUN mkdir -p /app/data && \
    printf '#!/bin/sh\nexec node /app/cli/paperless-ngx-dedupe.mjs "$@"\n' > /usr/local/bin/paperless-ngx-dedupe && \
    chmod +x /usr/local/bin/paperless-ngx-dedupe

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

LABEL org.opencontainers.image.source="https://github.com/rknightion/paperless-ngx-dedupe"
LABEL org.opencontainers.image.description="Document deduplication companion for Paperless-NGX"

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=DEP0040", "--require", "./telemetry.cjs", "build"]
