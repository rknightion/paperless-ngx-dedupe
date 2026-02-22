# Project: Paperless NGX Dedupe

Document deduplication companion for Paperless-NGX. Syncs documents from a Paperless-NGX instance, identifies duplicates via MinHash/LSH, and provides a web UI and REST API for reviewing and resolving them.

## Architecture

pnpm monorepo (Node >=24.0.0 required) with four packages:

- **`packages/core`** — Framework-agnostic TypeScript library owning all business logic: Paperless API client, sync, MinHash/LSH dedup engine, Drizzle ORM schema, SQLite job queue, queries, and telemetry. No web framework imports allowed here.
- **`packages/web`** — SvelteKit 2 app (Svelte 5 runes). Serves the UI and REST API (`/api/v1/*`). Imports core for all logic; does not implement independent business logic.
- **`packages/sdk`** — Public npm package (`private: false`). Zero-dependency TypeScript HTTP client wrapping all `/api/v1/*` endpoints for external consumers. Exports compiled `dist/`.
- **`packages/cli`** — Private command-line runner (commander.js). Connects directly to a local SQLite DB via core.

Path aliases: `@paperless-dedupe/core` → `packages/core/src/index.ts`; `@paperless-dedupe/sdk` → `packages/sdk/src/index.ts`.

## Quality Checks

Always run the full build and type-check (`npm run build` or equivalent) after completing any code changes. Do not consider a task done until the build passes cleanly with zero errors.

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
pnpm build         # Build all packages in dependency order: core → sdk → cli → web
pnpm check         # Type-check all four packages
pnpm test          # Vitest unit tests for core and sdk (not integration tests — see Gotchas)
pnpm test:e2e      # Playwright E2E tests against a built web package
pnpm lint          # ESLint
pnpm lint:fix      # ESLint auto-fix
pnpm format        # Prettier check
pnpm format:fix    # Prettier auto-fix
pnpm cli           # Run CLI in dev via tsx (not built output)
```

Single-package variant: `pnpm --filter @paperless-dedupe/core test`, etc.

## Workflow

Run `pnpm lint && pnpm format && pnpm check && pnpm test` before pushing. CI additionally runs `pnpm audit --audit-level=high` and a Docker build-verify job on every PR.

## Gotchas & Constraints

- **Node >=24.0.0 is required.** Do not test or build with older Node versions.
- `pnpm test` runs **only unit tests** (core + sdk). Integration tests in `packages/core/vitest.integration.config.ts` require a live Paperless-NGX Docker instance and run separately in CI.
- **`packages/sdk` is a public package.** Its exported API surface is a breaking-change boundary — treat it like a published library.
- All `/api/v1/*` routes must return JSON with consistent error shapes and correct HTTP status codes. SvelteKit page `.server.ts` load functions must call the same core query functions as the corresponding API routes — not duplicate logic independently.
- Database schema changes: modify Drizzle table definitions in `packages/core/src/schema/sqlite/`; there are no migration files. The app detects changes via SHA-256 hash at startup and applies DDL automatically (`AUTO_MIGRATE=true` by default).
- The CLI uses esbuild with `--external:better-sqlite3`. Adding a native module to `packages/cli` requires adding it to the esbuild externals list in the CLI build config.

## Key Files & References

- `packages/core/src/config.ts` — all environment variables, Zod schemas, and defaults
- `packages/core/src/schema/sqlite/` — Drizzle table definitions (source of truth for DB schema)
- `packages/core/src/index.ts` — public API of the core library
- `packages/core/src/jobs/worker-paths.ts` — worker module path resolution (critical for Docker)
- `.env.example` — full environment variable reference including OpenTelemetry config
