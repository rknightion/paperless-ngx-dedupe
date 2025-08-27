#!/bin/bash

# Development setup script for paperless-dedupe

set -e

echo "🚀 Setting up Paperless-NGX Deduplication Development Environment"
echo "================================================================="

# Install dependencies
echo "📦 Installing dependencies with uv..."
uv sync

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cp .env.example .env
    echo "✏️  Please edit .env with your configuration"
fi

# Start database services
echo "🐳 Starting database services..."
docker-compose up -d postgres redis

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run migrations
echo "🔄 Running database migrations..."
uv run alembic upgrade head

# Run tests to verify setup
echo "🧪 Running tests to verify setup..."
uv run pytest tests/unit/ -v --tb=short

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Edit .env with your paperless-ngx connection details"
echo "   2. Start the application: uv run paperless-dedupe"
echo "   3. Visit http://localhost:8000/docs for API documentation"
echo "   4. Run tests: ./scripts/test.sh"
