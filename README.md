# Paperless-NGX Deduplication Tool

A powerful document deduplication tool for [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that identifies duplicate documents using advanced fuzzy matching and MinHash/LSH algorithms, designed to handle large document collections efficiently.

## Features

- 🌐 **Modern Web UI**: React TypeScript frontend with real-time updates
- ⚡ **Scalable Architecture**: Handles 13,000+ documents efficiently using MinHash/LSH algorithms
- 🧠 **Smart Deduplication**: Multi-factor similarity scoring with OCR-aware fuzzy matching
- 🚀 **High Performance**: Redis caching layer with configurable TTLs
- ⚙️ **Flexible Configuration**: Web-based configuration with connection testing
- 📊 **Detailed Analytics**: Confidence scores and space-saving calculations
- 🔄 **Real-time Updates**: WebSocket integration for live progress tracking
- 🐳 **Container Ready**: Full Docker support with docker-compose

## Quick Start

### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/paperless-ngx-dedupe.git
cd paperless-ngx-dedupe
```

2. Configure environment (optional):
```bash
cp .env.example .env
# Edit .env with your paperless-ngx connection details
```

3. Build and start the services:
```bash
# First time setup or after code changes
docker compose build
docker compose up -d

# Or force rebuild without cache
docker compose build --no-cache
docker compose up -d
```

4. **Access the application**:
   - **Web UI**: http://localhost:3000 (React frontend served by nginx)
   - **API Backend**: http://localhost:8000 (FastAPI backend)
   - **API Documentation**: http://localhost:8000/docs (interactive API docs)
   - **API Status**: http://localhost:8000/api (API health check)

#### Rebuilding After Changes

**Frontend Changes:**
```bash
# After modifying frontend code (React/TypeScript)
cd frontend
npm run build
cd ..
docker compose build frontend
docker compose up -d frontend
```

**Backend Changes:**
```bash
# After modifying backend code (Python/FastAPI)
docker compose build paperless-dedupe
docker compose up -d paperless-dedupe
```

**Full Rebuild:**
```bash
# Rebuild everything from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Local Development

#### Prerequisites
- Python 3.13+ with [uv](https://docs.astral.sh/uv/) package manager
- Node.js 18+ with npm
- Docker and Docker Compose (for databases)

#### Backend Setup

1. Install Python dependencies:
```bash
uv sync
```

2. Start Redis and PostgreSQL services:
```bash
docker-compose up -d redis postgres
```

3. Run database migrations (if using Alembic):
```bash
uv run alembic upgrade head
```

4. Start the backend server:
```bash
# Option 1: Using the entry point (recommended)
uv run uvicorn paperless_dedupe.main:app --host 0.0.0.0 --port 8000 --reload

# Option 2: Using the script (simpler but with warning)
uv run paperless-dedupe
```

#### Frontend Setup

5. Install frontend dependencies:
```bash
cd frontend
npm install
```

6. Build the frontend for production:
```bash
npm run build
```

7. **Access the application**:
   - **Web UI**: http://localhost:3000 (if using split containers)
   - **API Backend**: http://localhost:8000 
   - **API Documentation**: http://localhost:8000/docs

#### Frontend Development Mode (Optional)

For frontend development with hot reload:

```bash
# In one terminal - backend
uv run uvicorn paperless_dedupe.main:app --host 0.0.0.0 --port 8001 --reload

# In another terminal - frontend dev server
cd frontend
npm run dev
```

Then access:
- **Frontend Dev Server**: http://localhost:5173 (with hot reload)
- **Backend API**: http://localhost:8001

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

| Variable | Description | Default |
|----------|-------------|---------|
| `PAPERLESS_DEDUPE_DATABASE_URL` | PostgreSQL connection string | `postgresql://paperless:paperless@localhost/paperless_dedupe` |
| `PAPERLESS_DEDUPE_REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `PAPERLESS_DEDUPE_PAPERLESS_URL` | Paperless-ngx API URL | `http://localhost:8000` |
| `PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN` | API token for authentication | None |
| `PAPERLESS_DEDUPE_FUZZY_MATCH_THRESHOLD` | Similarity threshold (0-100) | `80` |
| `PAPERLESS_DEDUPE_MAX_OCR_LENGTH` | Max OCR text to store | `10000` |

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
- **Cache Strategy**: Multi-layer caching with Redis and SQLite
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
  - [ ] CI/CD pipeline with GitHub Actions
  - [ ] Monitoring and observability
  - [ ] Authentication and multi-tenancy

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) team for the excellent document management system
- [datasketch](https://github.com/ekzhu/datasketch) for MinHash implementation
- [rapidfuzz](https://github.com/maxbachmann/RapidFuzz) for fast fuzzy string matching