Business logic library for Paperless NGX Dedupe. No web framework dependencies — must remain importable by web, SDK, and CLI without pulling in SvelteKit or browser APIs.

## Tests

- **Unit tests** (co-located `*.test.ts`): `pnpm test` or `vitest run` from this directory.
- **Integration tests** (`vitest.integration.config.ts`): `vitest run --config vitest.integration.config.ts` — require a live Paperless-NGX Docker instance. These do not run as part of the root `pnpm test`.

## Gotchas

- **No migration files exist.** Schema changes are auto-applied at startup via SHA-256 comparison of Drizzle table definitions. Edit files in `src/schema/sqlite/` directly; never create hand-written migration SQL.
- Worker modules (`src/jobs/workers/`) must be registered in `src/jobs/worker-paths.ts` to be resolvable across dev, built, and Docker environments. Adding a new worker type without updating that file will fail in production.
- This package exports source (`src/index.ts`), not compiled output. Web and SDK import from source during dev and build via the path alias in the root `tsconfig.json`.
