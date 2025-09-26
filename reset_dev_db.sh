#!/bin/bash
# Reset PostgreSQL development database and apply migrations

echo "🔄 Resetting PostgreSQL development database..."

# Stop containers
docker-compose -f docker-compose.dev.yml down

# Remove PostgreSQL data directory to start fresh (now using local directory)
rm -rf ./postgres_data 2>/dev/null || true

# Start PostgreSQL and Redis
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 8

# Run migrations
echo "Running database migrations..."
docker-compose -f docker-compose.dev.yml run --rm paperless-dedupe alembic upgrade head

echo "✅ PostgreSQL database reset complete! You can now start the full stack with:"
echo "docker-compose -f docker-compose.dev.yml up"