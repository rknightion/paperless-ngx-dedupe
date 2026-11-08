# Paperless NGX Dedupe

Document deduplication companion for Paperless-NGX: syncs documents from a Paperless-NGX instance,
finds duplicates with MinHash/LSH, and serves a web UI plus REST API for resolving them.

## Package boundary

pnpm workspace, Node >=24.0.0 (declared in `engines`). Do not build or test on older Node.

Both Docker stages pin a Node release with eMudhra distrust (24.22.1 or newer on the 24 line)
and install the distribution ca-certificates package. Verify the built runtime package and both
compromised-chain probes; the Node bundled trust store and operating-system store are separate.

- `packages/core` owns all business logic and must stay importable without SvelteKit or browser
  APIs. No web-framework imports here.
- `packages/web` is the SvelteKit 2 app (Svelte 5 runes) serving the UI and `/api/v1/*`. It calls
  core for logic rather than reimplementing it, and a page `.server.ts` load function calls the same
  core query functions as the matching API route.
- Path alias `@paperless-dedupe/core` resolves to `packages/core/src/index.ts`, source rather than
  `dist`.

## Task interface

`just check` (fmt-check, lint, typecheck, core unit tests) is the gate, and it is exactly what CI's
`quality` and `unit-tests` jobs run.

- E2E is deliberately outside `check`. CI runs it as a separate `e2e-tests` job, `just build` then
  `just test-e2e`, because Playwright needs both packages built first.
- `just audit` is advisory: CI runs it `continue-on-error`, so a finding does not block.
- CI's unit-tests job adds coverage and JUnit reporter arguments for artifact upload. Those belong
  in the workflow, not in `just test`.
- No recipe is marked `[confirm]`. Never bypass one added later with `--yes` or `JUST_YES=1`.

## Conventions

- Inline type imports, enforced by ESLint `consistent-type-imports`: `import { type Foo }`, never
  `import type { Foo }`.
- Unused variables and arguments must be `_`-prefixed; that is the only pattern the linter ignores.
- Svelte 5: `SvelteMap` / `SvelteSet` from `svelte/reactivity` instead of native `Map` / `Set` in
  reactive state, `const` (not `let`) for `$derived`, keyed `{#each}` blocks, no `<svelte:component>`,
  and never the Svelte 4 forms `$:` or `export let` for props.

## API contract

Every `/api/v1/*` route returns JSON through the `apiSuccess(data, meta?, status)` and
`apiError(code, message, details?)` helpers in `packages/web/src/lib/server/api.ts`. Success is
`{ data, meta? }`, failure is `{ error: { code, message, details? } }`, and codes come from the
`ErrorCode` map in that same file.

## Database schema changes take two steps

Editing the Drizzle table definition alone does nothing to an existing database.

1. Edit the table in `packages/core/src/schema/sqlite/`.
2. Add a pre-DDL migration function in `packages/core/src/db/migrate.ts` doing
   `ALTER TABLE ... ADD COLUMN` behind a `tableHasColumn` guard, and call it from
   `migrateDatabase()`. `migrateArchiveColumns` and `migrateDiscriminativeScore` are the pattern.

Auto-migration stores a schema hash after applying DDL, but the DDL it generates is
`CREATE TABLE IF NOT EXISTS`, so existing tables are skipped and new columns never land. Pre-DDL
migrations run before the hash check.

## Key files

- `packages/core/src/config.ts` and `packages/core/src/config/registry.ts` - environment variables,
  Zod schemas, defaults
- `packages/core/src/schema/sqlite/` - source of truth for the database schema
- `packages/core/src/index.ts` - the public surface of core
- `packages/core/src/jobs/worker-paths.ts` - worker module resolution, load-bearing in Docker
- `.env.example` - full environment reference including the OpenTelemetry settings

## Tracking work

Work is tracked in this repository's GitHub issues; they are the only queue. Do not add a checklist
file such as `ROADMAP.md` beside them.

- A pull request body says how it relates to an issue, on a line of its own: `Closes #N` with the
  `Acceptance evidence` table from `.github/pull_request_template.md` (one row for each acceptance
  criterion of that issue), `Refs #N` when it only relates to one, or `Task: none, <reason>`.
- A pull request that changes `.github/workflows/` or `.github/actions/` carries no closing keyword:
  write `Task: none, <reason>`, with `Refs #N` beside it if you like.
- Contributors never need the project board or the tracker tooling; a maintainer handles both.
- Issues and pull requests are public, so they carry no real identifiers: no email addresses,
  handles, tenant or account ids, host or device names, addresses, or document contents from a real
  Paperless instance. Write the shape, not the instance (`<host>/api/documents/<id>`, "the second
  correspondent"). Aggregate counts, timings and structural findings are fine.
- Older commits, docs and tests cite legacy board ids such as `PND-0001`. `just issue <ID>` prints
  the issue each one became; `.github/tracker/id-map.json` is the map.
