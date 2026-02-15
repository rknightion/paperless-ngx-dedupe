---
title: Installation
description: Install Paperless NGX Dedupe with Docker Compose, then verify sync and analysis are ready
---

# Installation

## Prerequisites

- Docker Engine with Docker Compose v2 (`docker compose`)
- A running Paperless-NGX instance
- A Paperless-NGX API token (recommended) or username/password

## Docker Installation

Use the repo's included `compose.yml` and `.env.example`.

```bash
# 1) Copy env template
cp .env.example .env

# 2) Edit .env
# Required:
#   PAPERLESS_URL=http://your-paperless-host:8000
#   PAPERLESS_API_TOKEN=...
#   (or PAPERLESS_USERNAME + PAPERLESS_PASSWORD)

# 3) Start

docker compose up -d
```

Open `http://localhost:3000`.

### Important URL Note

If Paperless-NGX also runs in Docker, do not use `localhost` for `PAPERLESS_URL` unless both services are in the same container. Use a reachable container/service hostname (for example `http://paperless-ngx:8000`) on a shared Docker network.

## Verify Installation

```bash
# Process is up
curl http://localhost:3000/api/v1/health

# DB + Paperless reachability
curl http://localhost:3000/api/v1/ready
```

Then in the UI:

1. Open **Settings** and click **Test Connection**.
2. From the dashboard, run **Sync Now**.
3. Run **Analyze** after sync completes.

## Development Setup

```bash
git clone https://github.com/rknightion/paperless-ngx-dedupe.git
cd paperless-ngx-dedupe
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` is useful for UI/API development, but background workers (sync, analysis, batch delete) are not reliable there. Use Docker for full end-to-end behavior.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically at startup when `AUTO_MIGRATE=true` (default).

## Backup

With the default compose file, the SQLite DB is persisted on the host at `./docker-data/paperless-ngx-dedupe.db`.

```bash
# Optional: stop first for a consistent file copy
docker compose down
cp docker-data/paperless-ngx-dedupe.db paperless-ngx-dedupe-backup.db
docker compose up -d
```

You can also back up runtime config via API:

```bash
curl -o config-backup.json http://localhost:3000/api/v1/export/config.json
```

## Uninstall

```bash
# Stop and remove container (keeps data in ./docker-data)
docker compose down

# Remove app data too
rm -rf docker-data
```
