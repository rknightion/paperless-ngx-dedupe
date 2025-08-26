# Paperless-NGX Deduplication Tool

## ⚠️ CRITICAL: Database Schema Changes

**MANDATORY**: ANY changes to database models in `src/paperless_dedupe/models/database.py` MUST be followed by creating an Alembic migration:

```bash
# After modifying ANY database model, ALWAYS run:
PAPERLESS_DEDUPE_DATABASE_URL=postgresql://paperless:paperless@localhost:35432/paperless_dedupe \
uv run alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file in alembic/versions/
# Commit both the model changes AND the migration file
```

**Never skip this step!** Users rely on migrations to upgrade without losing data.

## Project Overview
A comprehensive document deduplication tool for paperless-ngx that identifies and helps manage duplicate documents using advanced fuzzy matching and MinHash/LSH algorithms.

## Architecture

### Technology Stack
- **Backend**: FastAPI with async/await support
- **Database**: PostgreSQL for persistent storage (with Alembic migrations)
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
PAPERLESS_DEDUPE_DATABASE_URL=postgresql://user:pass@host/db
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

### Local Setup
```bash
# Install dependencies
uv sync

# IMPORTANT: Run migrations after any schema change
PAPERLESS_DEDUPE_DATABASE_URL=postgresql://paperless:paperless@localhost:35432/paperless_dedupe \
uv run alembic upgrade head

# Create new migration after changing models
PAPERLESS_DEDUPE_DATABASE_URL=postgresql://paperless:paperless@localhost:35432/paperless_dedupe \
uv run alembic revision --autogenerate -m "Your change description"

# Start development server
uv run paperless-dedupe
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
- PostgreSQL with TOAST for large text storage (up to 500K chars per document)
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

3. **High False Positives**
   - Increase `fuzzy_match_threshold`
   - Adjust `lsh_threshold` higher
   - Review confidence score weights

4. **Missing Duplicates**
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