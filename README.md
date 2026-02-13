# Paperless-Dedupe

> [!CAUTION]
> **This project is in early development and is NOT ready for use.** Features are incomplete, APIs will change, and data loss may occur. Do not use this in production or against a Paperless-NGX instance you care about.

A document deduplication companion for [Paperless-NGX](https://github.com/paperless-ngx/paperless-ngx). It syncs your documents, identifies duplicates using MinHash/LSH algorithms, and provides a web UI to review and resolve them.

## Features

- **Intelligent duplicate detection** — MinHash signatures + Locality-Sensitive Hashing for efficient O(n log n) candidate discovery
- **Multi-dimensional similarity scoring** — combines text content (Jaccard), fuzzy text matching, metadata, and filename similarity
- **Document sync** — full and incremental sync from your Paperless-NGX instance
- **Background processing** — worker threads with real-time progress via Server-Sent Events
- **Web UI** — dashboard, document browser, duplicate review, and settings pages
- **Single container deployment** — Docker with embedded SQLite, no external dependencies

## Tech Stack

- **TypeScript** monorepo (pnpm workspaces)
- **SvelteKit 2** / **Svelte 5** — web app and API server
- **Tailwind CSS 4** — styling
- **Drizzle ORM** + **SQLite** — database
- **Vitest** — testing
- **Node.js ≥ 22** runtime

## Project Structure

```
packages/
├── core/     # Dedup engine, Paperless API client, sync pipeline, job queue
└── web/      # SvelteKit app (UI + REST API)
```

## Quick Start

```bash
cp .env.example .env
# Edit .env — set PAPERLESS_URL and PAPERLESS_API_TOKEN

docker compose up -d
# Open http://localhost:3000
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PAPERLESS_URL` | Yes | — | Your Paperless-NGX instance URL |
| `PAPERLESS_API_TOKEN` | Yes* | — | API token for authentication |
| `PAPERLESS_USERNAME` | No | — | Alternative: username/password auth |
| `PAPERLESS_PASSWORD` | No | — | Alternative: username/password auth |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
| `CORS_ALLOW_ORIGIN` | No | — | CORS origin (empty = same-origin) |
| `AUTO_MIGRATE` | No | `true` | Run DB migrations on startup |

\* Either `PAPERLESS_API_TOKEN` or `PAPERLESS_USERNAME`/`PAPERLESS_PASSWORD` is required.

## Development

```bash
pnpm install
pnpm dev        # Start dev server (http://localhost:5173)
pnpm build      # Production build
pnpm check      # TypeScript type checking
pnpm lint       # Lint
pnpm test       # Run tests
```

## API

All endpoints are under `/api/v1/`:

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check |
| `/sync` | POST | Trigger document sync |
| `/sync/status` | GET | Sync status |
| `/analysis` | POST | Run duplicate analysis |
| `/analysis/status` | GET | Analysis status |
| `/jobs` | GET | List jobs |
| `/jobs/:id` | GET | Job details |
| `/jobs/:id/progress` | GET | SSE progress stream |
| `/jobs/:id/cancel` | POST | Cancel job |
| `/config/test-connection` | POST | Test Paperless connection |
| `/config/dedup` | GET/PUT | Dedup algorithm config |

## How It Works

1. **Sync** — fetches documents from Paperless-NGX, normalises text, computes change fingerprints
2. **Shingling** — tokenises document text into 3-gram word shingles
3. **MinHash** — generates compact signatures (192 permutations) for each document
4. **LSH** — indexes signatures into 20 bands to efficiently find candidate pairs
5. **Scoring** — computes weighted similarity across text, metadata, and filenames
6. **Grouping** — clusters duplicates using union-find and presents them for review

## License

[GNU General Public License v3](LICENSE)
