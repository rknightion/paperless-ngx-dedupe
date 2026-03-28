Private command-line runner (commander.js) for Paperless NGX Dedupe. Connects directly to a local SQLite DB via `@paperless-dedupe/core`.

## Commands

```bash
pnpm build    # Compile with tsc → dist/
pnpm check    # Type-check
pnpm dev      # Run via tsx (not built output)
```

## Gotchas

- **Native module resolution:** `better-sqlite3` is a native module in `dependencies`. It is resolved at runtime by Node.js, not bundled.
- The binary entry point is `dist/bin.js`. During development, use `pnpm cli` from the repo root (runs via tsx) instead of the built binary.
