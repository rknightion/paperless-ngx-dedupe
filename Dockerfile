# Rebuild the installed esbuild versions with a patched Go standard library.
FROM golang:1.27.4-trixie@sha256:f18c3d73a184fb0582828510722e723b63a93f7188d11dd223d9be6f6880e65d AS esbuild
ENV CGO_ENABLED=0
RUN GOBIN=/out/0.18.20 go install github.com/evanw/esbuild/cmd/esbuild@v0.18.20 && \
    GOBIN=/out/0.25.12 go install github.com/evanw/esbuild/cmd/esbuild@v0.25.12

# Stage 1: Install dependencies
FROM node:26.13.1-trixie-slim@sha256:615a27817f7b9508f0de73eb1cc8fc8894ab122bee56c1a7a568b72cd1032067 AS deps

WORKDIR /app

ENV CI=true

# better-sqlite3 v13 is built from source during installation.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates zlib1g && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/web/package.json ./packages/web/

# Node 26 no longer ships corepack: install the pnpm version pinned in package.json
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build

COPY . .

RUN pnpm --filter @paperless-dedupe/core build && pnpm --filter @paperless-dedupe/web build

# Create the standalone production dependency tree
RUN pnpm --filter @paperless-dedupe/web deploy --legacy --prod /app/deployed

COPY --from=esbuild /out /tmp/esbuild
ARG TARGETARCH
RUN set -eu; case "$TARGETARCH" in amd64) platform=x64 ;; arm64) platform=arm64 ;; *) exit 1 ;; esac && \
    for version in 0.18.20 0.25.12; do \
      install -m 755 "/tmp/esbuild/$version/esbuild" \
        "/app/deployed/node_modules/.pnpm/@esbuild+linux-$platform@$version/node_modules/@esbuild/linux-$platform/bin/esbuild"; \
      install -m 755 "/tmp/esbuild/$version/esbuild" \
        "/app/deployed/node_modules/.pnpm/esbuild@$version/node_modules/esbuild/bin/esbuild"; \
      node -e "require('/app/deployed/node_modules/.pnpm/esbuild@$version/node_modules/esbuild').transformSync('const value = 1')"; \
    done && rm -rf /tmp/esbuild

# Exercise the compiled core package from its deployed dependency ancestry.
# Raw worker threads use this same package boundary in the production image.
RUN node -e "import('/app/deployed/node_modules/@paperless-dedupe/core/dist/scheduler/occurrences.js')"

# Stage 3: Production runtime
FROM node:26.13.1-trixie-slim@sha256:615a27817f7b9508f0de73eb1cc8fc8894ab122bee56c1a7a568b72cd1032067 AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini gosu ca-certificates zlib1g && rm -rf /var/lib/apt/lists/*

# The production entrypoint runs Node directly. Keep package managers in the build stage.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

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

ARG VERSION=dev
ENV APP_VERSION=${VERSION}
LABEL org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=DEP0040", "--require", "./telemetry.cjs", "build"]
