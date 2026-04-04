Business logic library for Paperless NGX Dedupe. No web framework dependencies — must remain importable by web without pulling in SvelteKit or browser APIs.

## Modules

The library is organized into these major subsystems (all re-exported from `src/index.ts`):

- **schema** — Drizzle table definitions and relations
- **db** — Database creation, migration, and connection management
- **paperless** — Paperless-NGX API client with typed error hierarchy
- **sync** — Document syncing from Paperless to local DB
- **dedup** — MinHash/LSH fingerprinting, shingle generation, scoring, and duplicate analysis
- **jobs** — SQLite-backed job queue with worker thread infrastructure
- **queries** — Dashboard, documents, duplicates, and config queries
- **ai** — AI-powered metadata extraction (OpenAI provider, batch processing, flex processing, auto-apply)
- **rag** — RAG pipeline (vector store, chunking, embeddings, search, conversations)
- **telemetry** — OpenTelemetry tracing, metrics, and Paperless metrics coordinator
- **config** — Zod-validated environment config (`parseConfig`)
- **export** — Document export utilities

## Commands

```bash
pnpm build       # Compile with tsc
pnpm check       # Type-check
pnpm test        # Vitest unit tests (co-located *.test.ts)
pnpm test:watch  # Vitest in watch mode
```

## Gotchas

- **No migration SQL files exist.** Schema changes are auto-applied at startup via SHA-256 comparison of Drizzle table definitions. Edit files in `src/schema/sqlite/` directly. However, **adding columns to existing tables also requires a pre-DDL migration function** in `src/db/migrate.ts` — see the root CLAUDE.md "Database schema changes" gotcha for the full two-step process.
- Worker modules (`src/jobs/workers/`) run in **separate Node.js threads** (not the main process). They must be registered in `src/jobs/worker-paths.ts` to be resolvable across dev, built, and Docker environments. Adding a new worker type without updating that file will fail in production. In Docker, `packages/core/dist` is copied separately so workers can load compiled code outside the SvelteKit bundle.
- This package exports source (`src/index.ts`), not compiled output. Web imports from source during dev and build via the path alias in the root `tsconfig.json`.
