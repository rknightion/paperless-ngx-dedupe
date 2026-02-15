---
title: Installation
description: Install Paperless-Dedupe using Docker Compose or set up a local development environment
---

# Installation

## Prerequisites

- **Docker** and **Docker Compose** (v2)
- A running **Paperless-NGX** instance (v1.x or v2.x)
- A Paperless-NGX **API token** (recommended) or admin username/password

## Generating a Paperless-NGX API Token

1. Log in to your Paperless-NGX instance as an admin.
2. Open **Settings** (gear icon in the top-right corner).
3. Navigate to the **Users & Groups** section.
4. Click on your user account.
5. Under **Token**, click **Generate** (or copy the existing token).
6. Save the token securely -- you will need it for the next step.

Alternatively, generate a token via the Paperless-NGX API:

```bash
curl -X POST http://your-paperless:8000/api/token/ \
  -d "username=admin&password=yourpassword"
```

The response contains your token:

```json
{ "token": "abc123def456..." }
```

## Docker Installation

Create a directory for Paperless-Dedupe and add the following files:

### `.env` file

```bash
# Required: Your Paperless-NGX instance URL
PAPERLESS_URL=http://paperless:8000

# Authentication (use ONE method):
# Option A: API token (recommended)
PAPERLESS_API_TOKEN=your-api-token-here

# Option B: Username and password
# PAPERLESS_USERNAME=admin
# PAPERLESS_PASSWORD=your-password

# Required for SvelteKit in production:
# Set this to the URL users will access Paperless-Dedupe at
ORIGIN=http://localhost:3000
```

### `docker-compose.yml`

```yaml
services:
  app:
    image: ghcr.io/your-org/paperless-dedupe:latest # Replace with actual image
    ports:
      - '${PORT:-3000}:3000' # Web UI and API
    volumes:
      - app-data:/app/data # SQLite database persistence
    env_file:
      - .env
    restart: unless-stopped
    stop_grace_period: 30s
    read_only: true # Security: read-only root filesystem
    tmpfs:
      - /tmp # Writable temp directory for workers
    security_opt:
      - no-new-privileges:true # Security: prevent privilege escalation

volumes:
  app-data: # Named volume for database persistence
```

!!! info "Docker Networking"
    If Paperless-NGX runs in a Docker container on the same host, use the container name or Docker network IP as `PAPERLESS_URL` (e.g., `http://paperless-ngx:8000`). Using `localhost` inside a container refers to the container itself, not the host machine.

### Start the application

```bash
docker compose up -d
```

Verify the installation:

```bash
curl http://localhost:3000/api/v1/health
```

Open your browser to `http://localhost:3000`.

## Development Installation

For contributing or local development:

```bash
# Clone the repository
git clone https://github.com/rknightion/paperless-ngx-dedupe.git
cd paperless-ngx-dedupe

# Install dependencies (requires pnpm and Node.js 24+)
pnpm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your Paperless-NGX connection details

# Start the development server
pnpm dev
# Opens at http://localhost:5173
```

!!! warning "Worker Thread Limitation"
    Background jobs (sync, analysis, batch delete) use `worker_threads` that run as raw Node.js processes outside Vite. These do **not** work with `pnpm dev`. Use `docker compose up` to test the full workflow including background jobs.

See the [Development Guide](development.md) for more details on the development setup.

## Upgrading

Pull the latest image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup (controlled by the `AUTO_MIGRATE` environment variable). Your data is preserved in the Docker volume.

## Backup

Back up your SQLite database by copying the Docker volume:

```bash
docker compose exec app cp /app/data/paperless-dedupe.db /tmp/backup.db
docker compose cp app:/tmp/backup.db ./paperless-dedupe-backup.db
```

You can also export your configuration via the API:

```bash
curl http://localhost:3000/api/v1/export/config.json -o config-backup.json
```

## Uninstalling

Stop and remove the container and its data:

```bash
# Stop the container (preserves data volume)
docker compose down

# Stop and DELETE all data (irreversible)
docker compose down -v
```
