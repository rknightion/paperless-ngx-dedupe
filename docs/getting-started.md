# Getting Started

> **Early Development Warning:** Paperless-Dedupe is in early development and is NOT production-ready. Features are incomplete, APIs will change, and data loss may occur. Do not use this against a Paperless-NGX instance you care about without backups.

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

Alternatively, you can generate a token via the Paperless-NGX API:

```bash
curl -X POST http://your-paperless:8000/api/token/ \
  -d "username=admin&password=yourpassword"
```

The response contains your token:

```json
{ "token": "abc123def456..." }
```

## Installation with Docker Compose

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

> **Docker Networking:** If Paperless-NGX runs in a Docker container on the same host, use the container name or Docker network IP as `PAPERLESS_URL` (e.g., `http://paperless-ngx:8000`). Using `localhost` inside a container refers to the container itself, not the host machine.

### Start the application

```bash
docker compose up -d
```

Open your browser to `http://localhost:3000`.

## First Run Walkthrough

### 1. Check the Dashboard

The dashboard at `/` shows the current state of your Paperless-Dedupe instance. On first launch, all counters will be zero.

### 2. Verify Connection

Navigate to **Settings** in the sidebar. Click **Test Connection** to verify Paperless-Dedupe can reach your Paperless-NGX instance. You should see the Paperless-NGX version and document count.

If the connection fails, see the [Troubleshooting Guide](troubleshooting.md#paperless-ngx-connection-issues).

### 3. Sync Documents

Navigate to **Settings** or the **Dashboard** and click **Sync**. This starts a background job that:

- Fetches all documents from your Paperless-NGX instance
- Extracts and normalizes text content
- Computes change fingerprints for incremental sync

Progress is shown in real-time via a progress bar. The first sync fetches all documents and may take a few minutes for large libraries.

### 4. Run Analysis

Once sync completes, click **Analyze** to run the deduplication pipeline. This:

- Generates MinHash signatures for each document
- Uses LSH (Locality-Sensitive Hashing) to find candidate pairs
- Scores candidates across four similarity dimensions
- Groups duplicates using union-find clustering

If the **autoAnalyze** option is enabled (the default), analysis runs automatically after each sync.

### 5. Review Duplicates

Navigate to **Duplicates** in the sidebar. You will see a list of duplicate groups sorted by confidence score. For each group:

- Click to open the detail view with side-by-side comparison
- View text diffs between documents
- Set the primary document (the one to keep)
- Mark as reviewed or resolved

### 6. Batch Operations

For large numbers of duplicates, use the **Bulk Operations Wizard** (button on the Duplicates page) to review, resolve, or delete non-primary documents in batch.

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

## Next Steps

- [Configuration Reference](configuration.md) -- all environment variables and algorithm settings
- [API Reference](api-reference.md) -- complete REST API documentation
- [How It Works](how-it-works.md) -- understand the deduplication algorithm
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
