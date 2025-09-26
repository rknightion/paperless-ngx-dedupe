#!/bin/bash

# Reset database script - completely drops and recreates the database
# WARNING: This will DELETE ALL DATA!

echo "WARNING: This will completely DROP and RECREATE the paperless_dedupe database!"
echo "All data will be PERMANENTLY DELETED!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo "Stopping containers..."
docker-compose down

echo "Removing postgres data volume..."
docker volume rm paperless-ngx-dedupe_postgres_data 2>/dev/null || true

# For development setup with local directory
if [ -d "./postgres_data" ]; then
    echo "Removing local postgres_data directory..."
    sudo rm -rf ./postgres_data
fi

echo "Starting fresh database..."
docker-compose up -d postgres

echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "Running migrations..."
docker-compose run --rm paperless-dedupe alembic upgrade head

echo "Database reset complete!"
echo "You can now start the application with: docker-compose up -d"