# Docker Compose Configuration Guide

This project provides two Docker Compose configurations for different use cases:

## Production Configuration (`docker-compose.yml`)

Use this for running the application in production or when you want to use pre-built images.

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Features:**

- Uses pre-built images from GitHub Container Registry
- PostgreSQL database for robust data storage
- Redis for Celery task queue
- Celery worker for background processing
- Frontend served from optimized production build
- Optional Flower service for monitoring (uncomment to enable)

**Services:**

- `postgres` - PostgreSQL database (internal only)
- `redis` - Task queue broker (port 6379, internal only)
- `paperless-dedupe` - Backend API (port 30001)
- `worker` - Celery background task processor
- `frontend` - Web UI (port 30002)
- `flower` - Celery monitoring UI (port 5555, optional)

## Development Configuration (`docker-compose.dev.yml`)

Use this for local development with hot-reloading and source code mounting.

```bash
# Start all services with development configuration
docker-compose -f docker-compose.dev.yml up

# Rebuild after dependency changes
docker-compose -f docker-compose.dev.yml build

# Stop all services
docker-compose -f docker-compose.dev.yml down
```

**Features:**

- Builds from local Dockerfile
- Mounts source code for hot-reloading
- Backend runs with `--reload` flag
- Frontend runs with `npm run dev`
- Includes Flower for task monitoring
- Source directories mounted as volumes

**Services:**

- Same as production, plus:
- Source code mounted for live development
- Flower enabled by default for debugging

## Environment Variables

Both configurations support the same environment variables:

```bash
# Required
PAPERLESS_DEDUPE_PAPERLESS_URL=http://your-paperless:8000
PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN=your-api-token

# Optional
PAPERLESS_DEDUPE_LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
PAPERLESS_DEDUPE_SECRET_KEY=your-secret-key  # Generate a secure key for production
FLOWER_BASIC_AUTH=admin:password  # Change for Flower access
```

Create a `.env` file in the project root to set these values.

## Celery Task Monitoring

Both configurations include Flower for monitoring Celery tasks:

- **Production**: Uncomment the `flower` service in `docker-compose.yml`
- **Development**: Enabled by default in `docker-compose.dev.yml`
- **Access**: http://localhost:5555 (default credentials: admin/changeme)

## Database Management

The PostgreSQL database is managed by Docker and persists data in a named volume.

Migrations are automatically applied on container startup. To manually run migrations:

```bash
# Production
docker-compose exec paperless-dedupe alembic upgrade head

# Development
docker-compose -f docker-compose.dev.yml exec paperless-dedupe alembic upgrade head
```

For production, set PostgreSQL credentials in environment:

```bash
POSTGRES_DB=paperless_dedupe
POSTGRES_USER=paperless_dedupe
POSTGRES_PASSWORD=your-secure-password  # Required!
```

## Scaling Workers

To scale Celery workers for better performance:

```bash
# Scale to 3 worker instances
docker-compose up -d --scale worker=3
```

Note: Each worker will consume resources, so monitor your system capacity.
