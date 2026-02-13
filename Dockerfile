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

RUN pnpm --filter @paperless-dedupe/web build

# Stage 3: Production
FROM node:22-slim AS production

WORKDIR /app

RUN corepack enable

COPY --from=build /app/packages/web/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/package.json ./

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "build"]
