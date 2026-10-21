# Loop: paperless-ngx-dedupe

tier: guarded
gate: just check
ci-required: ci-success
grafana-stack: none

Public repository: `backlog/` is committed, so no account identifier, host or device name, address or
document content from a real Paperless instance in any task or doc. Run `just` with stdin from
`/dev/null`. The gate list in `backlog/config.yml` `definition_of_done` is authoritative;
`pnpm test:e2e` is in it when `packages/web` behaviour changed.

## Credentials

- None held by the loop. A lane needs no live Paperless instance.

## Traps

- A schema change is two edits: the Drizzle table in `packages/core/src/schema/sqlite/` and a pre-DDL
  migration in `packages/core/src/db/migrate.ts` (`ALTER TABLE ADD COLUMN` behind a `tableHasColumn`
  guard, called from `migrateDatabase()`; copy the nearest existing one). Auto-migration emits
  `CREATE TABLE IF NOT EXISTS`, so a new column on an existing table is never added and a fresh
  database hides it. The lane names the migration it added and tests against a database created
  before its change.
- A UI change is not done on the strength of class names: measure contrast in a browser against the
  real surface in both colour schemes. White on the filled accent uses `--color-on-accent`.
- `packages/core` imports no web framework. Anything touching core's dependencies or
  `packages/core/src/jobs/worker-paths.ts` is verified with `pnpm docker:validate`, not `pnpm build`.
- Tailwind v4 `@theme static` in `app.css` is load-bearing; `@theme inline` would defeat `.dark`. Do
  not tidy it.
- The confidence trio (`ui/ConfidenceBadge.svelte`, `duplicates/ConfidenceBreakdown.svelte`,
  `duplicates/ConfidenceTooltipContent.svelte`) must change thresholds together.
- `lucide-svelte` ships legacy class components: type icon props as `typeof SomeIcon`, not `Component`.
- `/api/v1/*` and the page loader call the same core query; a `.server.ts` load that re-implements it
  drifts.
- CI is load-sensitive: give timing-dependent tests realistic timeouts, never tighter ones.

## Mutexes

- `pnpm test:e2e` binds port 4173 and recreates one database (`packages/web/data/e2e-test.db`): one
  runner at a time, or it runs once in the wiring pass. `pnpm docker:validate` binds host ports and
  is exclusive too. `pnpm test` and `pnpm check` are safe to run concurrently.
- Single owner, wiring pass only: `packages/core/src/index.ts`, `packages/core/src/config.ts`,
  `packages/core/src/db/migrate.ts` (append-ordered), `packages/web/src/lib/components/ui/index.ts`,
  `packages/web/src/app.css`.
