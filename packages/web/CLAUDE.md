SvelteKit 2 application (Svelte 5 runes) serving the UI and REST API for Paperless NGX Dedupe. Uses adapter-node for Docker deployment.

## Commands

```bash
pnpm dev             # Vite dev server
pnpm build           # Vite production build (adapter-node)
pnpm preview         # Preview production build locally
pnpm check           # svelte-kit sync + svelte-check
pnpm test:e2e        # Playwright E2E tests (requires a prior `pnpm build`)
pnpm test:e2e:ui     # Playwright interactive UI mode
pnpm test:e2e:headed # Playwright with visible browser
```

## Conventions

- **API responses**: Use `apiSuccess(data, meta?, status)` and `apiError(code, message, details?)` helpers from `$lib/server/api`. Success shape: `{ data, meta? }`. Error shape: `{ error: { code, message, details? } }`. Error codes are defined in the `ErrorCode` enum.
- **Hooks initialization**: Config, logger, and database are singletons initialized on first request in `hooks.server.ts` and injected via `event.locals`. CORS is handled via `CORS_ALLOW_ORIGIN` env var.
- **Feature flags**: Layout load (`+layout.server.ts`) passes `aiEnabled`, `ragEnabled`, `faroEnabled` (and Faro config) to the client from server config.
- **Styling**: Tailwind CSS v4 via Vite plugin (not PostCSS).

## Gotchas

- **IMPORTANT: adapter-node dependency externalization.** At production build time, adapter-node uses its own Rollup bundler — Vite's `ssr.external` has no effect on the production bundle. Only packages in `dependencies` (not `devDependencies`) of this `package.json` are externalized. Any package using native code or dynamic `require()` must be in `dependencies` or the production build will fail at runtime.
- `telemetry.cjs` in the package root is a CJS OpenTelemetry preload script required by the Docker container (`--require ./telemetry.cjs`). Do not delete it or add it to `.gitignore`.
- E2E tests in `e2e/` (at package root) use Playwright, not Vitest. They are not part of the root `pnpm test` and require the package to be built first.
- Svelte components use Svelte 5 runes syntax (`$state`, `$derived`, `$effect`). Do not use Svelte 4 reactive declarations (`$:`, `export let` for props).
