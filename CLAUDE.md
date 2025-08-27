# Paperless-NGX Deduplication Tool

## 🔧 CRITICAL: PyPaperless SDK Usage

**IMPORTANT**: This project uses the PyPaperless SDK for ALL Paperless-NGX API interactions. 

### PyPaperless Documentation Access
- Use Context7 MCP server with library ID: `/tb1337/paperless-api` 
- Or search for "PyPaperless" to get the SDK documentation
- The SDK provides async/await patterns, rich model objects, and comprehensive API coverage

### Key PyPaperless Patterns
```python
# Client initialization (use existing pattern in codebase)
from paperless_dedupe.services.paperless_client import PaperlessClient

async with PaperlessClient(**client_settings) as client:
    # All operations here
    await client.test_connection()
    docs = await client.get_all_documents()
    stats = await client.get_statistics()
```

**DO NOT**:
- Use httpx directly for Paperless API calls
- Create new HTTP client implementations
- Use synchronous API patterns

**ALWAYS**:
- Use the existing `PaperlessClient` wrapper in `services/paperless_client.py`
- Follow async/await patterns
- Use Context7 to check PyPaperless documentation for new features

### Available PyPaperless Features in Our Client

The `PaperlessClient` wrapper provides access to:
- **Documents**: CRUD operations, search, similarity matching, suggestions
- **Tags**: List, create, manage document tags
- **Correspondents**: Access and manage document correspondents
- **Document Types**: Manage document type classifications
- **Storage Paths**: Handle document storage locations
- **Custom Fields**: Support for custom document metadata
- **Statistics**: Comprehensive stats about the Paperless instance

Example usage for new features:
```python
# Search documents
results = await client.search_documents("invoice 2024")

# Get similar documents
similar = await client.get_similar_documents(document_id)

# Get comprehensive statistics
stats = await client.get_statistics()
# Returns: total_tags, total_correspondents, top_tags, etc.

# Get document suggestions (auto-classification)
suggestions = await client.get_document_suggestions(document_id)
```

## ⚠️ CRITICAL: Database Schema Changes

**MANDATORY**: ANY changes to database models in `src/paperless_dedupe/models/database.py` MUST be followed by creating an Alembic migration:

```bash
# After modifying ANY database model, ALWAYS run:
PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db \
uv run alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file in alembic/versions/
# Commit both the model changes AND the migration file
```

**Never skip this step!** Users rely on migrations to upgrade without losing data.

## Local Development Setup

### Prerequisites

- Python 3.13+
- Node.js and npm
- uv package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

### Quick Start for Local Development

```bash
# 1. Clone the repository
git clone <repo-url>
cd paperless-ngx-dedupe

# 2. Set up environment (optional)
cp .env.example .env
# Edit .env to configure your Paperless-NGX connection

# 3. Start both frontend and backend with hot-reloading
uv run python dev.py
```

This starts:

- Backend API: http://localhost:30001 (manual restart needed for changes)
- Frontend UI: http://localhost:3000 (with HMR/hot-reload)
- API Docs: http://localhost:30001/docs
- Full logging output visible in terminal

### Testing During Development

```bash
# Backend testing commands
uv run pytest                           # Run all tests
uv run pytest tests/unit                # Unit tests only
uv run pytest tests/integration         # Integration tests only
uv run pytest --cov=paperless_dedupe    # With coverage report

# Frontend testing commands
cd frontend
npm run lint                            # Check code style
npm run lint:fix                        # Auto-fix style issues
npm run type-check                      # TypeScript checking
npm run build                           # Test production build

# Code quality checks
uv run ruff check src/                  # Python linting
uv run ruff format src/                 # Python formatting

# Database operations
PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db \
uv run alembic upgrade head             # Apply all migrations

PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db \
uv run alembic downgrade -1             # Rollback one migration

# API testing
curl http://localhost:30001/health      # Health check
curl http://localhost:30001/api/v1/config/  # Get current config
```

### Development Workflow

1. **Backend Changes**: Edit files in `src/paperless_dedupe/` - server auto-reloads
2. **Frontend Changes**: Edit files in `frontend/src/` - browser auto-refreshes
3. **Database Schema Changes**:
   - Modify models in `src/paperless_dedupe/models/database.py`
   - Create migration: `PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db uv run alembic revision --autogenerate -m "description"`
   - Test locally before committing
4. **Testing API**: Use http://localhost:30001/docs for interactive testing

## Project Overview

A comprehensive document deduplication tool for paperless-ngx that identifies and helps manage duplicate documents using advanced fuzzy matching and MinHash/LSH algorithms.

## Architecture

### Technology Stack

- **Backend**: FastAPI with async/await support
- **Database**: SQLite for persistent storage (with Alembic migrations)
- **Deduplication**: MinHash/LSH with rapidfuzz for fuzzy matching
- **Container**: Docker with docker-compose
- **Migrations**: Alembic for database schema versioning

### Key Components

1. **API Client** (`services/paperless_client.py`)

   - Handles authentication (token or username/password)
   - Implements retry logic and rate limiting
   - Manages pagination for large document sets

2. **Deduplication Engine** (`services/deduplication_service.py`)

   - MinHash signatures for fast similarity detection
   - LSH indexing for O(n log n) scaling
   - Multi-factor confidence scoring
   - Fuzzy text matching for OCR variations

3. **REST API** (`api/v1/`)
   - Document management endpoints
   - Duplicate group operations
   - Processing control
   - Configuration management

## API Endpoints

### Documents

- `GET /api/v1/documents/` - List documents
- `GET /api/v1/documents/{id}` - Get document details
- `GET /api/v1/documents/{id}/content` - Get OCR content
- `GET /api/v1/documents/{id}/duplicates` - Get document duplicates
- `POST /api/v1/documents/sync` - Sync from paperless-ngx

### Duplicates

- `GET /api/v1/duplicates/groups` - List duplicate groups
- `GET /api/v1/duplicates/groups/{id}` - Get group details
- `POST /api/v1/duplicates/groups/{id}/review` - Mark as reviewed
- `DELETE /api/v1/duplicates/groups/{id}` - Delete group
- `GET /api/v1/duplicates/statistics` - Get statistics

### Processing

- `POST /api/v1/processing/analyze` - Start deduplication
- `GET /api/v1/processing/status` - Get processing status
- `POST /api/v1/processing/cancel` - Cancel processing
- `POST /api/v1/processing/clear-cache` - Clear cache

### Configuration

- `GET /api/v1/config/` - Get configuration
- `PUT /api/v1/config/` - Update configuration
- `POST /api/v1/config/test-connection` - Test paperless connection
- `POST /api/v1/config/reset` - Reset to defaults

## Deduplication Algorithm

### Multi-Stage Process

1. **MinHash Generation**: Create 128-bit signatures for each document
2. **LSH Indexing**: Build locality-sensitive hash tables for fast candidate selection
3. **Fuzzy Matching**: Apply rapidfuzz algorithms for refined scoring
4. **Confidence Calculation**: Weighted scoring based on:
   - Jaccard similarity (40%)
   - Fuzzy text ratio (30%)
   - Metadata matching (20%)
   - Filename similarity (10%)

### Scalability

- Handles 13,000+ documents efficiently
- Sub-linear O(n log n) complexity using LSH
- Configurable thresholds for precision/recall balance

## Configuration

### Environment Variables

```bash
PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db
PAPERLESS_DEDUPE_PAPERLESS_URL=http://paperless:8000
PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN=your-token
PAPERLESS_DEDUPE_FUZZY_MATCH_THRESHOLD=85  # Minimum 50%
PAPERLESS_DEDUPE_LOG_LEVEL=WARNING  # Can be DEBUG, INFO, WARNING, ERROR
```

### Key Settings

- `fuzzy_match_threshold`: Similarity threshold (50-100, default: 85)
- `max_ocr_length`: Fixed at 500,000 characters (not user-configurable)
- `lsh_threshold`: LSH similarity threshold (0.0-1.0)
- `minhash_num_perm`: Number of MinHash permutations (default: 128)
- `log_level`: Logging verbosity (WARNING by default)

## Development

### Local Development (Recommended)

```bash
# Use the development script for hot-reloading both frontend and backend
uv run python dev.py

# Or install and use the dev command
uv sync
uv run paperless-dedupe-dev
```

### Manual Backend-Only Setup

```bash
# Install dependencies
uv sync

# IMPORTANT: Run migrations after any schema change
PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db \
uv run alembic upgrade head

# Create new migration after changing models
PAPERLESS_DEDUPE_DATABASE_URL=sqlite:///data/paperless_dedupe.db \
uv run alembic revision --autogenerate -m "Your change description"

# Start backend server only
uv run uvicorn paperless_dedupe.main:app --reload --port 30001
```

### Docker Setup

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f paperless-dedupe

# Stop services
docker-compose down
```

### Testing

```bash
# Run tests
uv run pytest

# Run with coverage
uv run pytest --cov=paperless_dedupe
```

## Usage Workflow

1. **Initial Setup**

   - Configure paperless-ngx connection via API or UI
   - Test connection to ensure authentication works

2. **Document Sync**

   - Call `/api/v1/documents/sync` to import documents
   - Handles pagination automatically
   - Stores OCR content in database

3. **Run Analysis**

   - Call `/api/v1/processing/analyze` to start deduplication
   - Monitor progress via `/api/v1/processing/status`
   - Analysis runs in background

4. **Review Results**

   - Get duplicate groups via `/api/v1/duplicates/groups`
   - Review confidence scores and document details
   - Mark groups as reviewed/resolved

5. **Take Action**
   - Use paperless-ngx UI to delete duplicates
   - Or implement automated deletion (future feature)

## Performance Considerations

### Database Strategy

- SQLite for simple file-based storage (up to 500K chars per document)
- Alembic migrations for schema versioning
- Automatic migrations on startup

### Memory Management

- OCR text stored up to 500K characters (fixed limit)
- Streaming processing for large datasets
- Efficient MinHash storage (128 bytes per document)
- Dynamic confidence recalculation without rescanning

### Optimization Tips

- Adjust `lsh_threshold` for speed vs accuracy
- Tune `fuzzy_match_threshold` based on OCR quality
- Use `force_rebuild` sparingly to preserve cache

## Future Enhancements

### Planned Features

- Web UI with React frontend
- Automated document deletion
- Webhook integration for real-time sync
- ML-based duplicate detection
- Custom field matching
- Batch resolution operations

### API Improvements

- WebSocket for real-time progress
- Bulk operations endpoint
- Export functionality
- Audit logging

## Troubleshooting

### Common Issues

1. **Connection Failed**

   - Verify paperless-ngx URL is accessible
   - Check authentication credentials
   - Ensure API version compatibility

2. **Slow Processing**

   - Reduce `max_ocr_length` for faster processing
   - Increase Redis memory limit
   - Use document limit for testing

3. **Database Issues**

   - Ensure data directory exists and is writable
   - Check disk space for SQLite database file
   - Verify file permissions on data volume

4. **High False Positives**

   - Increase `fuzzy_match_threshold`
   - Adjust `lsh_threshold` higher
   - Review confidence score weights

5. **Missing Duplicates**
   - Lower thresholds carefully
   - Check OCR quality in paperless
   - Verify documents have content

## Contributing

### Code Style

- Follow PEP 8 guidelines
- Use type hints for all functions
- Document complex algorithms
- Write unit tests for new features

### Commit Messages

- Use conventional commits format
- Reference issues when applicable
- Keep messages concise but descriptive

### Testing Requirements

- Maintain >80% code coverage
- Test edge cases and error conditions
- Include integration tests for API endpoints
