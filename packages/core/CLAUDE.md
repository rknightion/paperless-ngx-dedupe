Business logic library for Paperless NGX Dedupe. No web framework dependencies — must remain importable by web without pulling in SvelteKit or browser APIs.

## Commands

```bash
pnpm build    # Compile with tsc
pnpm check    # Type-check
pnpm test     # Vitest unit tests (co-located *.test.ts)
```

## Gotchas

- **No migration SQL files exist.** Schema changes are auto-applied at startup via SHA-256 comparison of Drizzle table definitions. Edit files in `src/schema/sqlite/` directly. However, **adding columns to existing tables also requires a pre-DDL migration function** in `src/db/migrate.ts` — see the root CLAUDE.md "Database schema changes" gotcha for the full two-step process.
- Worker modules (`src/jobs/workers/`) must be registered in `src/jobs/worker-paths.ts` to be resolvable across dev, built, and Docker environments. Adding a new worker type without updating that file will fail in production.
- This package exports source (`src/index.ts`), not compiled output. Web imports from source during dev and build via the path alias in the root `tsconfig.json`.
