# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Paperless NGX Dedupe is a document deduplication companion for Paperless-NGX. It syncs documents from a Paperless-NGX instance, identifies duplicates using MinHash/LSH algorithms, and provides a web UI for reviewing and resolving duplicates. Early development — not production-ready.

## Commands

```bash
# Development
pnpm dev              # Start SvelteKit dev server (http://localhost:5173)
pnpm build            # Build both core and web packages
pnpm check            # Type-check both packages

# Testing (core package only, Vitest)
pnpm test             # Run all tests once
pnpm test:watch       # Watch mode

# Linting & Formatting
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier check
pnpm format:fix       # Prettier auto-fix
```

## Architecture

**Monorepo** (pnpm workspaces) with two packages:

- **`packages/core`** — Framework-agnostic TypeScript library. Contains all business logic: Paperless API client, document sync, MinHash/LSH dedup algorithms, job queue, database queries, and Drizzle ORM schema. This package has no web framework dependencies and can be reused by CLI tools or SDKs.

- **`packages/web`** — SvelteKit 2 application (Svelte 5 runes). Serves both the UI and REST API (`/api/v1/*`). Imports `@paperless-dedupe/core` for all logic. Uses adapter-node for Docker deployment.

### Key Technical Choices

- **Database:** SQLite (better-sqlite3) with Drizzle ORM. Schema defined in `packages/core/src/schema/`. DDL changes detected via SHA-256 hashing.
- **Background jobs:** worker_threads + SQLite job queue (no Redis). One job per type at a time. Job types: SYNC, ANALYSIS, BATCH_OPERATIONS.
- **Real-time progress:** Server-Sent Events (`/api/v1/jobs/:jobId/progress`).
- **Dedup algorithms:** Pure TypeScript MinHash (192 permutations) + LSH (20 bands) with 3-gram word shingles. No native deps beyond better-sqlite3.
- **Validation:** Zod for env config parsing and API request validation.
- **Logging:** Pino structured JSON logging.
- **Styling:** Tailwind CSS 4 via Vite plugin.

### Data Flow

1. **Sync:** POST `/api/v1/sync` → spawns worker thread → `syncDocuments()` fetches from Paperless API → normalizes text, computes fingerprints → persists to DB
2. **Analysis:** POST `/api/v1/analysis` → spawns worker thread → `runAnalysis()` runs 10-stage pipeline (signatures → LSH candidates → scoring → union-find clustering → group formation)
3. **Review:** UI at `/duplicates` → side-by-side comparison with OCR diff → set status (false positive/ignored/deleted), set primary via API

### Database Tables

Defined in `packages/core/src/schema/`: `document`, `documentContent`, `documentSignature`, `duplicateGroup`, `duplicateMember`, `job`, `appConfig`, `syncState`.

## Code Conventions

- **Formatting:** Prettier — 100 char width, single quotes, trailing commas, 2-space indent
- **Path alias:** `@paperless-dedupe/core` resolves to `packages/core/src/index.ts`
- **Test files:** Co-located as `*.test.ts` in `packages/core/src/`
- **API routes:** SvelteKit file-based routing at `packages/web/src/routes/api/v1/`
- **Env config:** Zod-validated in `packages/core/src/config.ts`, loaded from `.env` (see `.env.example`)

## Docker

Single-container deployment. Port 3000. SQLite data persisted via volume mount at `/app/data`. Health: `/api/v1/health`, readiness: `/api/v1/ready`. Non-root user (UID 1001).

```bash
docker compose up     # Requires .env file with PAPERLESS_URL and auth config
```
