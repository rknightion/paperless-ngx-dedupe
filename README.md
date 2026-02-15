# Paperless NGX Dedupe

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

> **Note:** Background jobs (sync, analysis, batch delete) use worker threads that run outside Vite as raw Node.js processes. These do not work with `pnpm dev` because Node.js cannot execute the TypeScript source files directly. Use `docker compose up` for local development to test the full workflow.

## License

[GNU General Public License v3](LICENSE)
