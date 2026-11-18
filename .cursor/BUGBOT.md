# Paperless ngx dedupe review

## Package boundary

Keep shared queries and job behavior in `packages/core`, with SvelteKit request handling in `packages/web`. Check that API routes and page loaders use the same core queries and preserve response shapes and error handling.

## Reviewed document changes

Review deletion preview and execution together. Preserve the confirmation requirement, plan operation and scope, and protection for the selected primary document. Check stale plans and retry boundaries with synthetic documents. Keep real document contents and instance identifiers out of public fixtures, diagnostics and review evidence.

## Existing database upgrades

For schema changes, check both the Drizzle schema and the guarded pre-DDL migration in `packages/core/src/db/migrate.ts`. Exercise a database from before the change as well as a fresh database. Check that rerunning the migration preserves existing rows and resumable work.

## UI consistency

Keep confidence thresholds consistent across the badge, breakdown and tooltip. Check contrast in both themes when presentation changes. Use coverage of the real interaction for Svelte behavior and realistic timeouts for background jobs.

## Verification

Run `just check`. Use dependency-aware builds for package changes and the web end-to-end gate when behavior changes. Worker paths and runtime dependencies also need container validation.
