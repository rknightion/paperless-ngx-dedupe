# packages/core

## Traps

- **There are no migration SQL files, deliberately.** Schema DDL is auto-applied at startup by
  comparing a SHA-256 hash of the Drizzle table definitions. Edit `src/schema/sqlite/` directly, and
  see the root file for the second step that adding a column to an existing table also needs.
- Workers under `src/jobs/workers/` run in separate Node threads, not the main process. A new worker
  must be added to the `WorkerName` union in `src/jobs/worker-paths.ts` or it will not resolve in
  dev, built or Docker environments; `getWorkerPath` throws only at dispatch time.
- The package `exports` map serves `src/index.ts` by default and `dist/*.d.ts` for types. Web
  imports source during dev and build via the root `tsconfig.json` path alias, so a stale `dist` can
  typecheck clean while the runtime behaviour comes from source.
