# Project: Paperless NGX Dedupe

Document deduplication companion for Paperless-NGX. Syncs documents from a Paperless-NGX instance, identifies duplicates via MinHash/LSH, and provides a web UI and REST API for reviewing and resolving them.

## Architecture

pnpm monorepo (Node >=24.0.0 required) with two packages:

- **`packages/core`** — Framework-agnostic TypeScript library owning all business logic: Paperless API client, sync, MinHash/LSH dedup engine, Drizzle ORM schema, SQLite job queue, queries, and telemetry. No web framework imports allowed here.
- **`packages/web`** — SvelteKit 2 app (Svelte 5 runes). Serves the UI and REST API (`/api/v1/*`). Imports core for all logic; does not implement independent business logic.

Path alias: `@paperless-dedupe/core` → `packages/core/src/index.ts`.

## Quality Checks

Always run the full build and type-check (`pnpm build` or equivalent) after completing any code changes. Do not consider a task done until the build passes cleanly with zero errors.

After editing files, check for duplicate imports and stale references from the previous code. Run ESLint or the project linter to catch these before proceeding.

## Svelte 5 Conventions

When working in Svelte 5 files (.svelte, .svelte.ts): use `SvelteMap` and `SvelteSet` instead of native `Map`/`Set`, use `const` (not `let`) for `$derived` runes, avoid deprecated `svelte:component` syntax, and ensure all `{#each}` blocks have unique keys.

## Debugging Guidelines

Before changing code to fix a bug, first investigate the root cause thoroughly (check git history, trace data flow, examine API responses). Do not make speculative code fixes before understanding why the issue occurs.

## Workflow Preferences

When creating implementation plans from todos.txt, keep the planning phase brief and present the plan for approval before exploring the entire codebase. Do not spend excessive time on exploration before producing actionable output.

## Commands

```bash
pnpm dev           # SvelteKit dev server (http://localhost:5173)
pnpm build         # Build all packages in dependency order: core → web
pnpm check         # Type-check all packages
pnpm test          # Vitest unit tests for core
pnpm test:e2e      # Playwright E2E tests against a built web package
pnpm lint          # ESLint
pnpm lint:fix      # ESLint auto-fix
pnpm format        # Prettier check
pnpm format:fix    # Prettier auto-fix
```

Single-package variant: `pnpm --filter @paperless-dedupe/core test`, etc.

## Workflow

Run `pnpm lint && pnpm format && pnpm check && pnpm test` before pushing. CI additionally runs `pnpm audit --audit-level=high` and a Docker build-verify job on every PR.

## Gotchas & Constraints

- **Node >=24.0.0 is required.** Do not test or build with older Node versions.
- `pnpm test` runs **only unit tests** (core).
- All `/api/v1/*` routes must return JSON with consistent error shapes and correct HTTP status codes. SvelteKit page `.server.ts` load functions must call the same core query functions as the corresponding API routes — not duplicate logic independently.
- **Database schema changes require TWO steps** (just editing the Drizzle table definition is NOT enough):
  1. Edit the Drizzle table definition in `packages/core/src/schema/sqlite/`.
  2. Add a **pre-DDL migration function** in `packages/core/src/db/migrate.ts` that uses `ALTER TABLE ADD COLUMN` with a `tableHasColumn` guard. Call it from `migrateDatabase()` alongside the other pre-DDL migrations. See `migrateArchiveColumns` or `migrateDiscriminativeScore` for the exact pattern.

  **Why both steps are needed:** The auto-migration system stores a schema hash after "applying" DDL, but it generates `CREATE TABLE IF NOT EXISTS` statements that skip existing tables — so new columns on existing tables are never added. The pre-DDL migration runs before the hash check and handles this reliably.

## Key Files & References

- `packages/core/src/config.ts` — all environment variables, Zod schemas, and defaults
- `packages/core/src/schema/sqlite/` — Drizzle table definitions (source of truth for DB schema)
- `packages/core/src/index.ts` — public API of the core library
- `packages/core/src/jobs/worker-paths.ts` — worker module path resolution (critical for Docker)
- `.env.example` — full environment variable reference including OpenTelemetry config
