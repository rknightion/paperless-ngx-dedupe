#!/bin/bash

# Test script for paperless-dedupe

set -e

echo "🧪 Running Paperless-NGX Deduplication Tests"
echo "============================================"

# Run unit tests with coverage
echo "📊 Running unit tests with coverage..."
uv run pytest tests/unit/ --cov=paperless_dedupe --cov-report=term-missing --cov-report=html -v

# Run integration tests (if database is available)
echo "🔗 Checking for database availability..."
if docker ps | grep -q postgres; then
    echo "📡 Database available, running integration tests..."
    uv run pytest tests/integration/ -v
else
    echo "⚠️  Database not available, skipping integration tests"
    echo "   To run integration tests, start database with: docker-compose up -d postgres redis"
fi

# Run performance benchmarks (optional)
echo "⚡ Running performance benchmarks..."
uv run pytest tests/benchmarks/ -v -m "not slow" || echo "⚠️  Some benchmarks may have failed"

echo ""
echo "✅ Test run completed!"
echo "📈 Coverage report generated in htmlcov/index.html"