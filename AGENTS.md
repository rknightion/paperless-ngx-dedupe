# Paperless NGX Dedupe

Document deduplication companion for Paperless-NGX: syncs documents from a Paperless-NGX instance,
finds duplicates with MinHash/LSH, and serves a web UI plus REST API for resolving them.

## Package boundary

pnpm workspace, Node >=24.0.0 (declared in `engines`). Do not build or test on older Node.

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

## Conventions

- Inline type imports, enforced by ESLint `consistent-type-imports`: `import { type Foo }`, never
  `import type { Foo }`.
- Unused variables and arguments must be `_`-prefixed; that is the only pattern the linter ignores.
- Svelte 5: `SvelteMap` / `SvelteSet` from `svelte/reactivity` instead of native `Map` / `Set` in
  reactive state, `const` (not `let`) for `$derived`, keyed `{#each}` blocks, no `<svelte:component>`.

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

## Task tracking

Open work lives in the Backlog.md tracker under `backlog/`, task prefix `pnd-`. Read the
**Agent fan-out protocol (canonical)** doc before designing a wave, and the **Wave operating model**
doc for this project's own rules.

### Tracker rules

Kept outside the tool-managed markers below so an upstream instructions update cannot drop them.

**`backlog/` ships in a public repository.** No real account identifiers or personal data in tasks,
docs or decisions: no email addresses, handles, tenant or account ids, host or device names,
addresses, or document contents from a real Paperless instance. Write the shape, not the instance
(`<host>/api/documents/<id>`, "the second correspondent"). Aggregate counts, timings and structural
findings are fine. Sweep before committing:

```bash
grep -rniE "rob-knight|@gmail|[0-9]{1,3}(\.[0-9]{1,3}){3}|/Users/" backlog/ && echo "PII FOUND"
```

- `--notes`, `--plan` and `--final-summary` replace the whole section silently and exit 0, so
  another session's writes vanish. Use `--append-notes`, `--append-plan`, `--append-final-summary`.
- `--dep`, `--assignee`, `--label`, `--acceptance-criteria`, `--ref` and `--modified-file` have set
  semantics: a second use discards the first. Pass the complete list in one call, or use the
  `--add-label` / `--ac` / `--add-ref` forms that append.
- Section boundaries in tracker markdown are HTML-comment markers. Break a marker line and the
  section is dropped silently at exit 0 with no repair command (`backlog doctor` only fixes
  duplicate task ids). Changing a value inside a section is recoverable; changing a marker is not.
  The file-editing tools are guarded, a `sed` is not.
- `backlog/config.yml` is the one file to hand-edit: list-valued keys cannot be set through
  `backlog config set`.
- Finalize in one call so an interrupted session cannot leave finished work looking unfinished:
  `backlog task edit pnd-0001 --check-ac 1 --check-ac 2 -s Done`.
- Never let two agents edit the same task. The concurrent-write race is fixed for the edit funnel
  only, not for reorder, draft saves, the TUI edit path, `doc update` or decision updates.

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
