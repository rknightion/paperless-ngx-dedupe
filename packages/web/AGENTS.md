# packages/web

SvelteKit 3 app on `adapter-node`, deployed as the Docker image.

## Traps

- In browser-reachable TypeScript, use a declaration-level type import when every import from
  `@paperless-dedupe/core` is a type. With verbatim module syntax, an inline type-only import can
  retain a side-effect import of the core entry point and load native SQLite code in the browser.

- **adapter-node externalization is decided by this `package.json`, not by Vite.** The production
  build runs adapter-node's own Rollup pass, where `ssr.external` has no effect. Only packages in
  `dependencies` are externalized. Anything using native code or a dynamic `require()` must sit in
  `dependencies` or the build succeeds and the container fails at runtime.
- `telemetry.cjs` in the package root is the CJS OpenTelemetry preload the image loads with
  `--require ./telemetry.cjs`. Do not delete it or add it to `.gitignore`.
- Unit tests live beside the code as `*.test.ts` and run with `just test`.
- `e2e/` at the package root is Playwright, not Vitest, so it is not picked up by any Vitest run.

## Conventions

- Config, logger, database and sqlite handle are process singletons created on first request by
  `getServerRuntime()` in `src/runtime.server.ts` and injected onto `event.locals` in
  `hooks.server.ts`. Take them from `locals`; do not open a second connection.
- Tailwind CSS v4 through the Vite plugin (`@tailwindcss/vite`), not PostCSS.
