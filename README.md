# Paperless-Dedupe

> [!CAUTION]
> **This project is in early development and is NOT ready for use.** Features are incomplete, APIs will change, and data loss may occur. Do not use this in production or against a Paperless-NGX instance you care about.

A document deduplication companion for [Paperless-NGX](https://github.com/paperless-ngx/paperless-ngx). It syncs your documents, identifies duplicates using MinHash/LSH algorithms, and provides a web UI to review and resolve them.

## Features

- **Intelligent duplicate detection** -- MinHash signatures + Locality-Sensitive Hashing for efficient O(n log n) candidate discovery
- **Multi-dimensional similarity scoring** -- combines text content (Jaccard), fuzzy text matching, metadata, and filename similarity
- **Document sync** -- full and incremental sync from your Paperless-NGX instance
- **Background processing** -- worker threads with real-time progress via Server-Sent Events
- **Web UI** -- dashboard, document browser, side-by-side duplicate review with OCR text diff
- **Batch operations** -- bulk review, resolve, and delete non-primary documents
- **Data export** -- CSV duplicate reports and JSON configuration backup/restore
- **Single container deployment** -- Docker with embedded SQLite, no external dependencies

## Quick Start

```bash
# Create a .env file with your Paperless-NGX connection details
cp .env.example .env
# Edit .env -- set PAPERLESS_URL and PAPERLESS_API_TOKEN

# Start the application
docker compose up -d

# Open http://localhost:3000
```

See the [Getting Started Guide](docs/getting-started.md) for a full walkthrough.

## Documentation

- [Getting Started](docs/getting-started.md) -- installation, first run walkthrough, upgrading
- [Configuration](docs/configuration.md) -- environment variables, algorithm tuning, Docker setup
- [API Reference](docs/api-reference.md) -- complete REST API with curl examples
- [How It Works](docs/how-it-works.md) -- the deduplication pipeline explained
- [Troubleshooting](docs/troubleshooting.md) -- common issues and solutions

## Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # Production build
pnpm check            # TypeScript type checking
pnpm lint             # Lint
pnpm test             # Run tests
```

## License

[GNU General Public License v3](LICENSE)
