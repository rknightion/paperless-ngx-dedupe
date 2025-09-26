# Paperless-NGX Deduplication Tool

[![CI](https://github.com/rknightion/paperless-ngx-dedupe/actions/workflows/ci.yml/badge.svg)](https://github.com/rknightion/paperless-ngx-dedupe/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/pkgs/container/paperless-ngx-dedupe)
[![License](https://img.shields.io/github/license/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/rknightion/paperless-ngx-dedupe)](https://github.com/rknightion/paperless-ngx-dedupe/releases)
[![Python](https://img.shields.io/badge/python-3.13%2B-blue)](https://www.python.org)

A powerful document deduplication tool for [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that identifies duplicate documents using advanced fuzzy matching and MinHash/LSH algorithms, designed to handle large document collections efficiently.

## Features

- 🌐 **Modern Web UI**: React TypeScript frontend with real-time updates
- ⚡ **Scalable Architecture**: Handles 13,000+ documents efficiently using MinHash/LSH algorithms
- 🧠 **Smart Deduplication**: Multi-factor similarity scoring with OCR-aware fuzzy matching
- 🚀 **High Performance**: PostgreSQL with optimized GIN indexes for JSON and full-text search
- ⚙️ **Flexible Configuration**: Web-based configuration with connection testing
- 📊 **Detailed Analytics**: Confidence scores and space-saving calculations
- 🔄 **Real-time Updates**: WebSocket integration for live progress tracking
- 🐳 **Container Ready**: Full Docker support with docker-compose

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

## Quick Start

### Using Docker (Recommended)

1. **Download docker-compose.yml**:

```bash
curl -O https://raw.githubusercontent.com/rknightion/paperless-ngx-dedupe/main/docker-compose.yml
```

2. **Start the services**:

```bash
docker compose up -d
```

3. **Access the application**:
   - **Web UI**: http://localhost:30002
   - **API Documentation**: http://localhost:30001/docs
4. **Configure paperless-ngx connection**:
   - Navigate to Settings in the web UI
   - Enter your paperless-ngx URL and API token
   - Click "Test Connection" to verify

That's it! The application will automatically pull the latest images from GitHub Container Registry.

### Alternative: Using Specific Version

To use a specific version instead of latest:

```bash
# Edit docker-compose.yml and replace :latest with :v1.0.0
sed -i 's/:latest/:v1.0.0/g' docker-compose.yml
docker compose up -d
```

## Development

For detailed development setup and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Quick Local Development Setup

```bash
# Clone the repository
git clone https://github.com/rknightion/paperless-ngx-dedupe.git
cd paperless-ngx-dedupe

# Option 1: Start both frontend and backend with hot-reloading (Recommended)
uv run python dev.py

# Option 2: Use Docker for development
docker compose -f docker-compose.dev.yml up -d

# Option 3: Manual setup
uv sync --dev
cd frontend && npm install
# Then run: uv run uvicorn paperless_dedupe.main:app --reload --port 30001
# And in another terminal: cd frontend && npm run dev
```

The `uv run python dev.py` script:

- Starts backend API on http://localhost:30001 (with hot-reloading)
- Starts frontend UI on http://localhost:3000 (with hot-reloading)
- Shows full backend logs with proper INFO/DEBUG output
- Handles all dependencies automatically via uv
- Shows color-coded logs for easy debugging
- Uses uv for proper Python environment isolation
- Automatically restarts on code changes for rapid development

## Web Interface

The application now includes a modern React TypeScript frontend with:

- 📊 **Dashboard**: Overview with statistics and system status
- 📄 **Documents**: Virtual scrolling list for large document collections
- 🔍 **Duplicates**: Visual duplicate group management with confidence scores
- ⚙️ **Processing**: Real-time analysis control with progress tracking
- 🛠️ **Settings**: Connection configuration and system preferences

### Initial Setup via Web UI

1. **Access the Web Interface**: Navigate to http://localhost:3000
2. **Configure Connection**: Go to Settings → Connection to configure your paperless-ngx API
3. **Test Connection**: Use the "Test Connection" button to verify settings
4. **Sync Documents**: Navigate to Documents and click "Sync from Paperless"
5. **Run Analysis**: Go to Processing and start the deduplication analysis
6. **Review Duplicates**: Check the Duplicates page for results

## Configuration via API

### Manual API Setup (Alternative)

1. **Configure Paperless Connection**:

```bash
curl -X PUT http://localhost:8000/api/v1/config/ \
  -H "Content-Type: application/json" \
  -d '{
    "paperless_url": "http://your-paperless:8000",
    "paperless_api_token": "your-api-token"
  }'
```

2. **Test Connection**:

```bash
curl -X POST http://localhost:8000/api/v1/config/test-connection
```

3. **Sync Documents**:

```bash
curl -X POST http://localhost:8000/api/v1/documents/sync
```

4. **Run Deduplication Analysis**:

```bash
curl -X POST http://localhost:8000/api/v1/processing/analyze
```

### Environment Variables

| Variable                                 | Description                  | Default                              |
| ---------------------------------------- | ---------------------------- | ------------------------------------ |
| `PAPERLESS_DEDUPE_DATABASE_URL`          | PostgreSQL connection string | `postgresql://user:pass@localhost/db` |
| `PAPERLESS_DEDUPE_PAPERLESS_URL`         | Paperless-ngx API URL        | `http://localhost:8000`              |
| `PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN`   | API token for authentication | None                                 |
| `PAPERLESS_DEDUPE_FUZZY_MATCH_THRESHOLD` | Similarity threshold (0-100) | `80`                                 |
| `PAPERLESS_DEDUPE_MAX_OCR_LENGTH`        | Max OCR text to store        | `10000`                              |

## API Documentation

Interactive API documentation is available at http://localhost:8000/docs

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

## Development

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
│   ├── package.json     # Frontend dependencies
│   └── dist/           # Built frontend (served by backend)
├── src/paperless_dedupe/
│   ├── api/v1/          # REST API endpoints + WebSocket
│   ├── core/            # Configuration and settings
│   ├── models/          # Database models
│   ├── services/        # Business logic
│   └── main.py          # FastAPI application with frontend serving
├── docker-compose.yml   # Container orchestration
├── Dockerfile          # Container definition
├── pyproject.toml      # Python dependencies and build config
└── CLAUDE.md          # LLM development context
```

### Running Tests

```bash
uv run pytest
uv run pytest --cov=paperless_dedupe
```

## Roadmap

- [x] **Web UI with React** - ✅ Complete (Phase 1)
- [ ] **Enhanced Deduplication Features** (Phase 2)
  - [ ] Image-based similarity with perceptual hashing
  - [ ] Custom field matching and extraction
  - [ ] ML-based detection with sentence transformers
- [ ] **Performance Optimizations** (Phase 3)
  - [ ] Parallel processing implementation
  - [ ] Database query optimization
  - [ ] Incremental processing with checkpoints
- [ ] **Paperless Integration** (Phase 4)
  - [ ] Webhook support for real-time sync
  - [ ] Automated document deletion
  - [ ] Batch resolution operations
  - [ ] Document preview and merge functionality
- [ ] **Infrastructure & DevOps** (Phase 5)
  - [x] CI/CD pipeline with GitHub Actions
  - [ ] Monitoring and observability
  - [ ] Authentication and multi-tenancy

## Support

- **Issues**: [GitHub Issues](https://github.com/rknightion/paperless-ngx-dedupe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rknightion/paperless-ngx-dedupe/discussions)
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup instructions
- Code style guidelines
- How to submit pull requests
- Testing requirements

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) team for the excellent document management system
- [datasketch](https://github.com/ekzhu/datasketch) for MinHash implementation
- [rapidfuzz](https://github.com/maxbachmann/RapidFuzz) for fast fuzzy string matching

## Star History

If you find this project useful, please consider giving it a ⭐ on GitHub!

[![Star History Chart](https://api.star-history.com/svg?repos=rknightion/paperless-ngx-dedupe&type=Date)](https://star-history.com/#rknightion/paperless-ngx-dedupe&Date)
