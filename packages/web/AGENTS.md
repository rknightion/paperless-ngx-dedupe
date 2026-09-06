# packages/web

SvelteKit 2 app on `adapter-node`, deployed as the Docker image.

## Traps

- **adapter-node externalization is decided by this `package.json`, not by Vite.** The production
  build runs adapter-node's own Rollup pass, where `ssr.external` has no effect. Only packages in
  `dependencies` are externalized. Anything using native code or a dynamic `require()` must sit in
  `dependencies` or the build succeeds and the container fails at runtime.
- `telemetry.cjs` in the package root is the CJS OpenTelemetry preload the image loads with
  `--require ./telemetry.cjs`. Do not delete it or add it to `.gitignore`.
- `e2e/` at the package root is Playwright, not Vitest, so it is not picked up by any Vitest run.

## Conventions

- Config, logger, database and sqlite handle are process singletons created on first request by
  `getServerRuntime()` in `src/runtime.server.ts` and injected onto `event.locals` in
  `hooks.server.ts`. Take them from `locals`; do not open a second connection.
- Tailwind CSS v4 through the Vite plugin (`@tailwindcss/vite`), not PostCSS.
