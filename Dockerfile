# Stage 1: Install dependencies
FROM node:22-slim AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build

COPY . .

RUN pnpm build

# Stage 3: Production dependencies only
FROM deps AS prod-deps

RUN pnpm install --frozen-lockfile --prod

# Stage 4: Production runtime
FROM node:22-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Copy production deps
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy built artifacts only
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/web/build ./build
COPY --from=build /app/package.json ./

# Create non-root user and data directory
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appgroup /app

ENV NODE_ENV=production

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "build"]
