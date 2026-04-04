# Paperless NGX Dedupe

A document deduplication and AI-powered metadata companion for [Paperless-NGX](https://github.com/paperless-ngx/paperless-ngx). It syncs your documents, identifies duplicates using MinHash/LSH algorithms, extracts metadata with LLMs, and lets you ask questions about your document library — all through a web UI and REST API.

## Features

### Deduplication

- **Intelligent duplicate detection** -- MinHash signatures + Locality-Sensitive Hashing for efficient O(n log n) candidate discovery
- **Similarity scoring** -- weighted Jaccard similarity and fuzzy text matching with a discriminative penalty that down-scores pairs sharing only boilerplate text
- **Side-by-side review** -- compare duplicate documents with OCR text diff and resolve them individually or in bulk

### AI Metadata Extraction

- **Automatic classification** -- extract correspondents, document types, and tags from document text using OpenAI models
- **Confidence scoring** -- per-field confidence scores with supporting evidence snippets so you can review before applying
- **Reference-aware** -- optionally feeds your existing correspondents, document types, and tags to the LLM to avoid creating duplicates
- **Batch processing** -- process your entire library or new documents automatically in configurable batches

### RAG Document Q&A

- **Ask questions about your documents** -- natural language queries answered using your document library as context
- **Hybrid search** -- combines vector similarity (OpenAI embeddings) with full-text search via Reciprocal Rank Fusion for accurate retrieval
- **Multi-turn conversations** -- follow-up questions with full conversation history and source citations
- **Cost-aware indexing** -- estimates embedding costs before indexing, with configurable chunk sizes and token budgets

### Platform

- **Document sync** -- full and incremental sync from your Paperless-NGX instance
- **Background processing** -- worker threads with real-time progress via Server-Sent Events
- **Web UI** -- dashboard, document browser, AI results review, and RAG chat interface
- **Batch operations** -- bulk review, apply, reject, and delete across duplicates and AI results
- **Data export** -- CSV duplicate reports and JSON configuration backup/restore
- **Observability** -- OpenTelemetry traces, metrics, and logs with optional Prometheus scrape endpoint and built-in Paperless-NGX system metrics collector
- **Single container deployment** -- Docker with embedded SQLite, no external dependencies

## Quick Start

**1. Create a `.env` file** with your Paperless-NGX connection details:

```env
PAPERLESS_URL=http://your-paperless-instance:8000
PAPERLESS_API_TOKEN=your-api-token-here
```

You can authenticate with an API token (recommended) or username/password. See [Configuration](https://m7kni.io/paperless-ngx-dedupe/configuration/) for all options.

**2. Start the container:**

```bash
docker compose up -d
```

**3. Open [http://localhost:3000](http://localhost:3000)** and go to **Settings > Test Connection** to verify connectivity.

**4. Sync and analyze.** From the dashboard, click **Sync** to pull your documents, then **Analyze** to detect duplicates. Both run as background jobs with real-time progress.

**5. Review duplicates** at `/duplicates` -- compare documents side-by-side and resolve them.

See the [Getting Started Guide](https://m7kni.io/paperless-ngx-dedupe/getting-started/) for a full walkthrough.

## Documentation

- [Getting Started](https://m7kni.io/paperless-ngx-dedupe/getting-started/) -- installation, first run walkthrough, upgrading
- [Configuration](https://m7kni.io/paperless-ngx-dedupe/configuration/) -- environment variables, algorithm tuning, Docker setup
- [API Reference](https://m7kni.io/paperless-ngx-dedupe/api-reference/) -- complete REST API with curl examples
- [How It Works](https://m7kni.io/paperless-ngx-dedupe/how-it-works/) -- the deduplication pipeline explained
- [Troubleshooting](https://m7kni.io/paperless-ngx-dedupe/troubleshooting/) -- common issues and solutions

## Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # Production build
pnpm check            # TypeScript type checking
pnpm lint             # Lint
pnpm test             # Run tests
```

> **Note:** Background jobs (sync, analysis, batch delete) use worker threads that run outside Vite as raw Node.js processes. These do not work with `pnpm dev` because Node.js cannot execute the TypeScript source files directly. Use `pnpm docker:dev` for local development to test the full workflow.

## License

[GNU General Public License v3](LICENSE)
