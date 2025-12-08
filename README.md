# Paperless-NGX Deduplication Tool

[![CI](https://github.com/rknightion/paperless-ngx-dedupe/actions/workflows/ci.yml/badge.svg)](https://github.com/rknightion/paperless-ngx-dedupe/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/pkgs/container/paperless-ngx-dedupe)
[![License](https://img.shields.io/github/license/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/releases)
[![Python](https://img.shields.io/badge/python-3.13%2B-blue)](https://www.python.org)

> **Warning**
> This project is under heavy development. Until v1.0 is released, expect breaking changes, incomplete features, and potential data issues. Use at your own risk and always maintain backups of your Paperless-NGX data.

A powerful document deduplication tool for [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that identifies duplicate documents using advanced fuzzy matching and MinHash/LSH algorithms, designed to handle large document collections efficiently.

## Features

- **Modern Web UI**: React TypeScript frontend with real-time updates
- **Scalable Architecture**: Handles 13,000+ documents efficiently using MinHash/LSH algorithms
- **Smart Deduplication**: Multi-factor similarity scoring with OCR-aware fuzzy matching
- **High Performance**: PostgreSQL with optimized GIN indexes for JSON and full-text search
- **Flexible Configuration**: Web-based configuration with connection testing
- **Detailed Analytics**: Confidence scores and space-saving calculations
- **Real-time Updates**: WebSocket integration for live progress tracking
- **Container Ready**: Full Docker support with docker-compose

## Why Use This?

If you're using paperless-ngx to manage your documents, you might have:

- **Duplicate scans** from re-scanning documents
- **Multiple versions** of the same document with slight OCR differences
- **Similar documents** that are hard to identify manually
- **Large collections** where manual duplicate checking is impractical

This tool helps you:

- **Save storage space** by identifying redundant documents
- **Clean up your archive** with confidence scores for each duplicate
- **Process large collections** efficiently (tested with 13,000+ documents)
- **Maintain data integrity** - only identifies duplicates, doesn't delete automatically

---

## Quick Start (Standalone Installation)

This is the simplest way to get started if you're running Paperless-NGX on a different server or want a completely isolated installation.

### 1. Download docker-compose.yml

```bash
mkdir paperless-dedupe && cd paperless-dedupe
curl -O https://raw.githubusercontent.com/rknightion/paperless-ngx-dedupe/main/docker-compose.yml
```

### 2. Start the services

```bash
docker compose up -d
```

### 3. Access the application

| Service      | URL                         | Description                   |
| ------------ | --------------------------- | ----------------------------- |
| **Web UI**   | http://localhost:30002      | Main application interface    |
| **API Docs** | http://localhost:30001/docs | Interactive API documentation |

### 4. Configure your Paperless-NGX connection

1. Open the Web UI at http://localhost:30002
2. Navigate to **Settings**
3. Enter your Paperless-NGX URL and API token
4. Click **Test Connection** to verify

That's it! The application will automatically pull the latest images from GitHub Container Registry.

---

## Running Alongside Paperless-NGX (Same Server)

> **Recommended for most users**: If you're already running Paperless-NGX with Docker Compose, you can add the dedupe tool to your existing setup to share PostgreSQL and Redis, reducing resource usage.

### Prerequisites

Before proceeding, identify your current Paperless-NGX setup:

| Your Database | Your Broker | What You Need                            |
| ------------- | ----------- | ---------------------------------------- |
| PostgreSQL    | Redis       | Add dedupe services only (ideal)         |
| PostgreSQL    | None        | Add dedupe services + Redis              |
| MariaDB/MySQL | Redis       | Add dedupe services + PostgreSQL         |
| SQLite        | Redis       | Add dedupe services + PostgreSQL         |
| SQLite        | None        | Add dedupe services + PostgreSQL + Redis |

### Option A: Full Integration (PostgreSQL + Redis already running)

If your Paperless-NGX already uses PostgreSQL and Redis, add these services to your existing `docker-compose.yml`:

```yaml
# Add to your existing Paperless-NGX docker-compose.yml

paperless-dedupe:
  image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
  container_name: paperless-dedupe
  depends_on:
    - db # Your existing PostgreSQL service name
    - broker # Your existing Redis service name
  ports:
    - "30001:8000"
  environment:
    # Use your existing PostgreSQL - create a NEW database for dedupe
    # You'll need to create this database first (see instructions below)
    PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless:paperless@db:5432/paperless_dedupe
    # Use your existing Redis but with a DIFFERENT database number
    # Paperless typically uses /0, so we use /1 to avoid conflicts
    PAPERLESS_DEDUPE_REDIS_URL: redis://broker:6379/1
    PAPERLESS_DEDUPE_LOG_LEVEL: INFO
  restart: unless-stopped

paperless-dedupe-worker:
  image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
  container_name: paperless-dedupe-worker
  depends_on:
    - db
    - broker
    - paperless-dedupe
  environment:
    PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless:paperless@db:5432/paperless_dedupe
    PAPERLESS_DEDUPE_REDIS_URL: redis://broker:6379/1
    PAPERLESS_DEDUPE_LOG_LEVEL: INFO
  restart: unless-stopped
  command: celery -A paperless_dedupe.worker.celery_app worker --loglevel=info --concurrency=2 --queues=high_priority,default,low_priority,deduplication,sync

paperless-dedupe-frontend:
  image: ghcr.io/rknightion/paperless-ngx-dedupe-frontend:latest
  container_name: paperless-dedupe-frontend
  ports:
    - "30002:80"
  depends_on:
    - paperless-dedupe
  environment:
    VITE_API_URL: http://paperless-dedupe:8000
  restart: unless-stopped
```

#### Create the dedupe database

Before starting, create the `paperless_dedupe` database in your existing PostgreSQL:

```bash
# Connect to your running PostgreSQL container
docker compose exec db psql -U paperless -c "CREATE DATABASE paperless_dedupe;"
```

#### Understanding the configuration

- **Database**: We create a separate `paperless_dedupe` database within your existing PostgreSQL instance. This keeps dedupe data isolated from Paperless-NGX data while sharing the same database server.

- **Redis**: Redis supports multiple databases (0-15 by default). Paperless-NGX typically uses database `0`, so we use database `1` (`redis://broker:6379/1`). This prevents any key conflicts between the applications.

### Option B: Partial Integration (MariaDB/SQLite users)

If your Paperless-NGX uses MariaDB or SQLite for its database, you'll need to add PostgreSQL for the dedupe tool (it requires PostgreSQL for its advanced indexing features):

```yaml
# Add to your existing Paperless-NGX docker-compose.yml

  # PostgreSQL for dedupe tool only
  paperless-dedupe-db:
    image: postgres:17-alpine
    container_name: paperless-dedupe-db
    restart: unless-stopped
    volumes:
      - paperless-dedupe-pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: paperless_dedupe
      POSTGRES_USER: paperless_dedupe
      POSTGRES_PASSWORD: paperless_dedupe  # Change in production!
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paperless_dedupe"]
      interval: 10s
      timeout: 5s
      retries: 5

  paperless-dedupe:
    image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
    container_name: paperless-dedupe
    depends_on:
      paperless-dedupe-db:
        condition: service_healthy
      broker:  # Your existing Redis service
        condition: service_started
    ports:
      - "30001:8000"
    environment:
      PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless_dedupe:paperless_dedupe@paperless-dedupe-db:5432/paperless_dedupe
      PAPERLESS_DEDUPE_REDIS_URL: redis://broker:6379/1
      PAPERLESS_DEDUPE_LOG_LEVEL: INFO
    restart: unless-stopped

  paperless-dedupe-worker:
    image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
    container_name: paperless-dedupe-worker
    depends_on:
      - paperless-dedupe-db
      - broker
      - paperless-dedupe
    environment:
      PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless_dedupe:paperless_dedupe@paperless-dedupe-db:5432/paperless_dedupe
      PAPERLESS_DEDUPE_REDIS_URL: redis://broker:6379/1
      PAPERLESS_DEDUPE_LOG_LEVEL: INFO
    restart: unless-stopped
    command: celery -A paperless_dedupe.worker.celery_app worker --loglevel=info --concurrency=2 --queues=high_priority,default,low_priority,deduplication,sync

  paperless-dedupe-frontend:
    image: ghcr.io/rknightion/paperless-ngx-dedupe-frontend:latest
    container_name: paperless-dedupe-frontend
    ports:
      - "30002:80"
    depends_on:
      - paperless-dedupe
    environment:
      VITE_API_URL: http://paperless-dedupe:8000
    restart: unless-stopped

volumes:
  paperless-dedupe-pgdata:  # Add to your existing volumes section
```

### Option C: No Redis (add both PostgreSQL and Redis)

If you don't have Redis running at all:

```yaml
# Add to your existing Paperless-NGX docker-compose.yml

  paperless-dedupe-db:
    image: postgres:17-alpine
    container_name: paperless-dedupe-db
    restart: unless-stopped
    volumes:
      - paperless-dedupe-pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: paperless_dedupe
      POSTGRES_USER: paperless_dedupe
      POSTGRES_PASSWORD: paperless_dedupe
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paperless_dedupe"]
      interval: 10s
      timeout: 5s
      retries: 5

  paperless-dedupe-redis:
    image: redis:7-alpine
    container_name: paperless-dedupe-redis
    restart: unless-stopped
    volumes:
      - paperless-dedupe-redis:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  paperless-dedupe:
    image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
    container_name: paperless-dedupe
    depends_on:
      paperless-dedupe-db:
        condition: service_healthy
      paperless-dedupe-redis:
        condition: service_healthy
    ports:
      - "30001:8000"
    environment:
      PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless_dedupe:paperless_dedupe@paperless-dedupe-db:5432/paperless_dedupe
      PAPERLESS_DEDUPE_REDIS_URL: redis://paperless-dedupe-redis:6379/0
      PAPERLESS_DEDUPE_LOG_LEVEL: INFO
    restart: unless-stopped

  paperless-dedupe-worker:
    image: ghcr.io/rknightion/paperless-ngx-dedupe:latest
    container_name: paperless-dedupe-worker
    depends_on:
      - paperless-dedupe-db
      - paperless-dedupe-redis
      - paperless-dedupe
    environment:
      PAPERLESS_DEDUPE_DATABASE_URL: postgresql://paperless_dedupe:paperless_dedupe@paperless-dedupe-db:5432/paperless_dedupe
      PAPERLESS_DEDUPE_REDIS_URL: redis://paperless-dedupe-redis:6379/0
      PAPERLESS_DEDUPE_LOG_LEVEL: INFO
    restart: unless-stopped
    command: celery -A paperless_dedupe.worker.celery_app worker --loglevel=info --concurrency=2 --queues=high_priority,default,low_priority,deduplication,sync

  paperless-dedupe-frontend:
    image: ghcr.io/rknightion/paperless-ngx-dedupe-frontend:latest
    container_name: paperless-dedupe-frontend
    ports:
      - "30002:80"
    depends_on:
      - paperless-dedupe
    environment:
      VITE_API_URL: http://paperless-dedupe:8000
    restart: unless-stopped

volumes:
  paperless-dedupe-pgdata:
  paperless-dedupe-redis:
```

### Connecting to Paperless-NGX on the Same Server

When both applications run on the same Docker network, you can use internal Docker networking:

1. Open the dedupe Web UI at http://localhost:30002
2. Go to **Settings**
3. For the Paperless URL, use the internal Docker service name:
   - If your Paperless service is named `webserver`: `http://webserver:8000`
   - If it's named `paperless`: `http://paperless:8000`
4. Enter your Paperless API token
5. Click **Test Connection**

> **Tip**: You can find your Paperless service name in your docker-compose.yml file.

---

## Docker Compose Reference

### Services Overview

| Service            | Port  | Description                        |
| ------------------ | ----- | ---------------------------------- |
| `postgres`         | 5432  | PostgreSQL database                |
| `redis`            | -     | Celery task broker (internal only) |
| `paperless-dedupe` | 30001 | Backend API server                 |
| `worker`           | -     | Celery background task worker      |
| `frontend`         | 30002 | Web UI                             |
| `flower`           | 5555  | Task monitoring (optional)         |

### Common Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f paperless-dedupe

# Stop all services
docker compose down

# Rebuild after updates
docker compose pull && docker compose up -d

# Restart a specific service
docker compose restart paperless-dedupe
```

### Enable Flower Monitoring

Flower provides a web UI for monitoring Celery tasks:

```bash
docker compose --profile monitoring up -d
```

Access Flower at http://localhost:5555 (default credentials: `admin`/`changeme`)

To change credentials, set `FLOWER_BASIC_AUTH` environment variable:

```bash
FLOWER_BASIC_AUTH=myuser:mypassword docker compose --profile monitoring up -d
```

### Scaling Workers

For large document collections, you can scale the worker:

```bash
docker compose up -d --scale worker=3
```

### Database Management

```bash
# Run database migrations manually
docker compose exec paperless-dedupe alembic upgrade head

# Check migration status
docker compose exec paperless-dedupe alembic current

# Reset database (WARNING: deletes all data)
docker compose down -v  # Removes volumes
docker compose up -d
```

---

## Configuration

### Environment Variables

| Variable                                 | Description                   | Default    |
| ---------------------------------------- | ----------------------------- | ---------- |
| `PAPERLESS_DEDUPE_DATABASE_URL`          | PostgreSQL connection string  | Required   |
| `PAPERLESS_DEDUPE_REDIS_URL`             | Redis connection string       | Required   |
| `PAPERLESS_DEDUPE_PAPERLESS_URL`         | Paperless-ngx URL             | Set via UI |
| `PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN`   | API token                     | Set via UI |
| `PAPERLESS_DEDUPE_FUZZY_MATCH_THRESHOLD` | Similarity threshold (50-100) | `85`       |
| `PAPERLESS_DEDUPE_LOG_LEVEL`             | Logging level                 | `WARNING`  |

### Using a Specific Version

To pin to a specific version instead of `latest`:

```bash
# Edit docker-compose.yml and replace :latest with a version tag
sed -i 's/:latest/:v1.0.0/g' docker-compose.yml
docker compose up -d
```

---

## Usage Workflow

### Initial Setup via Web UI

1. **Access the Web Interface**: Navigate to http://localhost:30002
2. **Configure Connection**: Go to Settings to configure your Paperless-NGX API
3. **Test Connection**: Use the "Test Connection" button to verify settings
4. **Sync Documents**: Navigate to Documents and click "Sync from Paperless"
5. **Run Analysis**: Go to Processing and start the deduplication analysis
6. **Review Duplicates**: Check the Duplicates page for results

### Web Interface Features

- **Dashboard**: Overview with statistics and system status
- **Documents**: Virtual scrolling list for large document collections
- **Duplicates**: Visual duplicate group management with confidence scores
- **Processing**: Real-time analysis control with progress tracking
- **Settings**: Connection configuration and system preferences

### Alternative: API Configuration

```bash
# Configure Paperless connection
curl -X PUT http://localhost:30001/api/v1/config/ \
  -H "Content-Type: application/json" \
  -d '{
    "paperless_url": "http://your-paperless:8000",
    "paperless_api_token": "your-api-token"
  }'

# Test connection
curl -X POST http://localhost:30001/api/v1/config/test-connection

# Sync documents
curl -X POST http://localhost:30001/api/v1/documents/sync

# Run deduplication analysis
curl -X POST http://localhost:30001/api/v1/processing/analyze
```

---

## API Documentation

Interactive API documentation is available at http://localhost:30001/docs

### Key Endpoints

- **Documents**

  - `GET /api/v1/documents/` - List all documents
  - `POST /api/v1/documents/sync` - Sync from paperless-ngx
  - `GET /api/v1/documents/{id}/duplicates` - Get document duplicates

- **Duplicates**

  - `GET /api/v1/duplicates/groups` - List duplicate groups
  - `GET /api/v1/duplicates/statistics` - Get deduplication statistics
  - `POST /api/v1/duplicates/groups/{id}/review` - Mark group as reviewed

- **Processing**
  - `POST /api/v1/processing/analyze` - Start deduplication analysis
  - `GET /api/v1/processing/status` - Get processing status

---

## How It Works

1. **Document Sync**: Fetches documents and OCR content from paperless-ngx
2. **MinHash Generation**: Creates compact signatures for each document
3. **LSH Indexing**: Builds locality-sensitive hash tables for fast similarity search
4. **Fuzzy Matching**: Applies text similarity algorithms for refined scoring
5. **Confidence Scoring**: Calculates weighted scores based on multiple factors:
   - Jaccard similarity (40%)
   - Fuzzy text ratio (30%)
   - Metadata matching (20%)
   - Filename similarity (10%)

## Performance

- **Scalability**: O(n log n) complexity using LSH instead of O(n²)
- **Memory Efficient**: ~50MB for 13K document metadata
- **Storage Strategy**: PostgreSQL database for concurrency, JSON support, and performance
- **Processing Speed**: ~1000 documents/minute on modern hardware

---

## Development

For detailed development setup and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Project Structure

```
paperless-ngx-dedupe/
├── frontend/            # React TypeScript frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Application pages
│   │   ├── services/    # API client and utilities
│   │   ├── store/       # Redux state management
│   │   └── hooks/       # Custom React hooks
│   └── package.json     # Frontend dependencies
├── src/paperless_dedupe/
│   ├── api/v1/          # REST API endpoints + WebSocket
│   ├── core/            # Configuration and settings
│   ├── models/          # Database models
│   ├── services/        # Business logic
│   └── main.py          # FastAPI application
├── docker-compose.yml   # Container orchestration
├── Dockerfile           # Container definition
└── pyproject.toml       # Python dependencies
```

### Running Tests

```bash
uv run pytest
uv run pytest --cov=paperless_dedupe
```

---

## Troubleshooting

### Connection Issues

- **"Connection refused"**: Ensure Paperless-NGX URL is accessible from the dedupe container
- **"Unauthorized"**: Verify your API token is correct and has sufficient permissions
- **Docker networking**: When running alongside Paperless, use the service name (e.g., `http://webserver:8000`) not `localhost`

### Performance Issues

- **Slow sync**: Large collections take time; check logs with `docker compose logs -f worker`
- **Memory issues**: Reduce worker concurrency by editing the worker command
- **Database slow**: Ensure PostgreSQL has adequate resources

### Database Issues

- **Migration errors**: Run `docker compose exec paperless-dedupe alembic upgrade head`
- **Connection refused**: Ensure PostgreSQL is healthy: `docker compose ps`

---

## Roadmap

- [x] Web UI with React
- [ ] Image-based similarity with perceptual hashing
- [ ] Automated document deletion
- [ ] Webhook support for real-time sync
- [ ] ML-based detection with sentence transformers

---

## Support

- **Issues**: [GitHub Issues](https://github.com/rknightion/paperless-ngx-dedupe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rknightion/paperless-ngx-dedupe/discussions)
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) team for the excellent document management system
- [datasketch](https://github.com/ekzhu/datasketch) for MinHash implementation
- [rapidfuzz](https://github.com/maxbachmann/RapidFuzz) for fast fuzzy string matching
