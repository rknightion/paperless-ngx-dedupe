# Stage 1: Install dependencies
FROM node:24.20.0-trixie-slim AS deps

WORKDIR /app

RUN corepack enable

ENV CI=true

# better-sqlite3 v13 is built from source during installation.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build

COPY . .

RUN pnpm --filter @paperless-dedupe/core build && pnpm --filter @paperless-dedupe/web build

# Create the standalone production dependency tree
RUN pnpm --filter @paperless-dedupe/web deploy --legacy --prod /app/deployed

# Exercise the compiled core package from its deployed dependency ancestry.
# Raw worker threads use this same package boundary in the production image.
RUN node -e "import('/app/deployed/node_modules/@paperless-dedupe/core/dist/scheduler/occurrences.js')"

# Stage 3: Production runtime
FROM node:24.20.0-trixie-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini gosu && rm -rf /var/lib/apt/lists/*

# Copy production deps from pnpm deploy (flat node_modules, no symlinks)
COPY --from=build /app/deployed/node_modules ./node_modules

# Copy SvelteKit build output
COPY --from=build /app/packages/web/build ./build
COPY --from=build /app/package.json ./

# Copy OTEL preload script (loaded via --require when OTEL_ENABLED=true)
COPY --from=build /app/packages/web/telemetry.cjs ./telemetry.cjs

# Create data directory
RUN mkdir -p /app/data

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
