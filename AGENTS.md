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

## Code Style

- **Inline type imports enforced** by ESLint: use `import { type Foo }` not `import type { Foo }`.
- **Unused variables**: prefix with `_` (e.g., `_unused`) — the linter ignores `_`-prefixed names.

## Svelte 5 Conventions

When working in Svelte 5 files (.svelte, .svelte.ts): use `SvelteMap` and `SvelteSet` instead of native `Map`/`Set`, use `const` (not `let`) for `$derived` runes, avoid deprecated `svelte:component` syntax, and ensure all `{#each}` blocks have unique keys.

## Debugging Guidelines

Before changing code to fix a bug, first investigate the root cause thoroughly (check git history, trace data flow, examine API responses). Do not make speculative code fixes before understanding why the issue occurs.

## Commands

```bash
pnpm dev              # SvelteKit dev server (http://localhost:5173)
pnpm build            # Build all packages in dependency order: core → web
pnpm check            # Type-check all packages
pnpm test             # Vitest unit tests for core
pnpm test:e2e         # Playwright E2E tests against a built web package
pnpm lint             # ESLint
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier check
pnpm format:fix       # Prettier auto-fix
pnpm docker:validate  # Docker build + compose up with health check
pnpm docker:dev       # Docker compose dev profile with live rebuild
```

Single-package variant: `pnpm --filter @paperless-dedupe/core test`, etc.

## Workflow

Run `pnpm lint && pnpm format --write && pnpm check && pnpm test` after completing work or before pushing. CI additionally runs `pnpm audit --audit-level=high` and a Docker build-verify job on every PR.

## Gotchas & Constraints

- **Node >=24.0.0 is required.** Do not test or build with older Node versions.
- `pnpm test` runs **only unit tests** (core).
- All `/api/v1/*` routes must return JSON with consistent error shapes and correct HTTP status codes. Use the `apiSuccess(data, meta?, status)` and `apiError(code, message, details?)` helpers — responses follow `{ data, meta? }` for success and `{ error: { code, message, details? } }` for errors. Error codes are defined in the `ErrorCode` enum. SvelteKit page `.server.ts` load functions must call the same core query functions as the corresponding API routes — not duplicate logic independently.
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

## Task tracking

Open work lives in the [Backlog.md](https://backlog.md) tracker under `backlog/`, not in a
roadmap file and not in GitHub Issues. The queue is a query, not a document:

```bash
backlog task list --plain            # what is open
backlog task view pnd-0001 --plain   # one task's own contract
backlog doc list --plain             # the durable documents
```

Read the **Agent fan-out protocol (canonical)** doc before designing a wave, and the **Wave
operating model** doc for this project's own rules. Both are in `backlog doc list --plain`.

### Non-negotiable rules

These are project rules, deliberately kept outside the tool-managed markers below so an
upstream instruction update cannot silently drop them.

**`backlog/` is committed to a PUBLIC repository.** Tasks, docs and decisions must never
contain real account identifiers or personal data — no email addresses, handles, account or
tenant ids, device or host names, addresses, or document contents from a real Paperless
instance. Write the shape, not the instance: "the second correspondent", `<host>/api/documents/<id>`.
Aggregate counts, timings and structural findings are fine. This is easy to break by accident
precisely because a tracker feels private. Sweep before committing:

```bash
grep -rniE "rob-knight|@gmail|[0-9]{1,3}(\.[0-9]{1,3}){3}|/Users/" backlog/ && echo "PII FOUND"
```

**Never use `--notes` or `--plan` bare.** They *silently replace* the whole section — another
session's writes vanish with no warning and exit 0. Use `--append-notes` and `--append-plan`.
This is an open upstream bug, not a misunderstanding. `.claude/hooks/backlog-guard.py` denies
the unsafe forms rather than trusting anyone to remember.

**Never hand-edit task, doc, decision or milestone markdown.** Section boundaries are
HTML-comment markers; break one and the section is *silently dropped* at exit 0, with the data
still in the file but invisible to the CLI until the next write destroys it for real. There is
no repair command — `backlog doctor` only fixes duplicate task IDs. Same hook denies this.
`backlog/config.yml` is the one exemption: list-valued keys cannot be set through
`backlog config set`, so hand-editing it is the documented path.

**Finalize in one call**, so an interrupted agent cannot leave finished work looking unfinished:

```bash
backlog task edit pnd-0001 --check-ac 1 --check-ac 2 -s Done
```

**Never let two agents edit the same task.** v1.50.x fixed the concurrent-write race for the
edit funnel, but not for reorder, draft saves, the TUI edit path, `doc update`, or decision
updates.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
