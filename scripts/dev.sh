#!/bin/bash
# Unified development helper script for paperless-dedupe
#
# Usage:
#   ./scripts/dev.sh setup        - Initial development setup
#   ./scripts/dev.sh reset-db     - Reset database (destructive!)
#   ./scripts/dev.sh worker       - Start Celery worker locally
#   ./scripts/dev.sh restart-worker - Restart Docker worker container
#   ./scripts/dev.sh test         - Run test suite
#   ./scripts/dev.sh test:unit    - Run unit tests only
#   ./scripts/dev.sh test:int     - Run integration tests only

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

print_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

# Load .env if present
load_env() {
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    fi
}

cmd_setup() {
    print_step "Setting up development environment..."

    # Install dependencies
    print_step "Installing Python dependencies..."
    uv sync

    # Create .env if missing
    if [ ! -f .env ]; then
        print_step "Creating .env from template..."
        cp .env.example .env
        print_warning "Edit .env with your configuration"
    fi

    # Start database services
    print_step "Starting database services..."
    docker compose up -d postgres redis

    # Wait for database
    print_step "Waiting for database..."
    sleep 5

    # Run migrations
    print_step "Running database migrations..."
    load_env
    uv run alembic upgrade head

    # Verify with tests
    print_step "Running unit tests to verify setup..."
    uv run pytest tests/unit/ -v --tb=short -q || true

    echo ""
    print_step "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Edit .env with your paperless-ngx connection"
    echo "  2. Start development: uv run python dev.py"
    echo "  3. Or use Docker: docker compose up"
}

cmd_reset_db() {
    print_warning "This will DROP and RECREATE the database!"
    print_warning "All data will be PERMANENTLY DELETED!"
    echo ""
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi

    print_step "Stopping containers..."
    docker compose down 2>/dev/null || true

    print_step "Removing database data..."
    # Named volume
    docker volume rm paperless-ngx-dedupe_postgres_data 2>/dev/null || true
    # Local directory (dev)
    rm -rf ./postgres_data 2>/dev/null || true

    print_step "Starting fresh database..."
    docker compose up -d postgres redis

    print_step "Waiting for PostgreSQL..."
    sleep 8

    print_step "Running migrations..."
    docker compose run --rm paperless-dedupe alembic upgrade head 2>/dev/null || {
        # Fallback for local development
        load_env
        uv run alembic upgrade head
    }

    print_step "Database reset complete!"
    echo "Start the application with: docker compose up"
}

cmd_worker() {
    print_step "Starting Celery worker..."
    load_env

    celery -A paperless_dedupe.worker.celery_app worker \
        --loglevel=info \
        --concurrency=4 \
        --queues=high_priority,default,low_priority,deduplication,sync \
        --hostname=paperless-dedupe-worker@%h \
        --max-tasks-per-child=100 \
        --pool=prefork
}

cmd_restart_worker() {
    print_step "Restarting Docker worker container..."
    docker compose restart worker

    print_step "Waiting for worker..."
    sleep 5

    print_step "Worker restarted with latest code"
}

cmd_test() {
    print_step "Running full test suite..."

    # Unit tests with coverage
    print_step "Unit tests..."
    uv run pytest tests/unit/ --cov=paperless_dedupe --cov-report=term-missing --cov-report=html -v

    # Integration tests if DB available
    if docker ps | grep -q postgres; then
        print_step "Integration tests..."
        uv run pytest tests/integration/ -v
    else
        print_warning "Database not available, skipping integration tests"
        echo "Start with: docker compose up -d postgres redis"
    fi

    print_step "Tests complete! Coverage report: htmlcov/index.html"
}

cmd_test_unit() {
    print_step "Running unit tests..."
    uv run pytest tests/unit/ -v
}

cmd_test_int() {
    print_step "Running integration tests..."
    if ! docker ps | grep -q postgres; then
        print_error "Database not running. Start with: docker compose up -d postgres redis"
        exit 1
    fi
    uv run pytest tests/integration/ -v
}

# Main command router
case "${1:-help}" in
    setup)
        cmd_setup
        ;;
    reset-db)
        cmd_reset_db
        ;;
    worker)
        cmd_worker
        ;;
    restart-worker)
        cmd_restart_worker
        ;;
    test)
        cmd_test
        ;;
    test:unit)
        cmd_test_unit
        ;;
    test:int)
        cmd_test_int
        ;;
    help|--help|-h)
        echo "Development helper script for paperless-dedupe"
        echo ""
        echo "Usage: ./scripts/dev.sh <command>"
        echo ""
        echo "Commands:"
        echo "  setup          Initial development environment setup"
        echo "  reset-db       Reset database (destructive!)"
        echo "  worker         Start Celery worker locally"
        echo "  restart-worker Restart Docker worker container"
        echo "  test           Run full test suite with coverage"
        echo "  test:unit      Run unit tests only"
        echo "  test:int       Run integration tests only"
        echo "  help           Show this help message"
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Run './scripts/dev.sh help' for usage"
        exit 1
        ;;
esac
