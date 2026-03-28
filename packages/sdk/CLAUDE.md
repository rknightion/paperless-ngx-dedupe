Public npm package (`private: false`) — zero-dependency TypeScript HTTP client wrapping all `/api/v1/*` endpoints. Exports compiled `dist/`, not source.

## Commands

```bash
pnpm build    # Compile with tsc → dist/
pnpm check    # Type-check
pnpm test     # Vitest unit tests
```

## Gotchas

- **This is a public package.** Any change to exported types or method signatures is a breaking-change boundary. Treat additions as minor and removals/renames as major.
- Consumers import from `dist/`, not source. Always run `pnpm build` after changes to verify the compiled output.
