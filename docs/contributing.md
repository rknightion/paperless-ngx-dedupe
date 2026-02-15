---
title: Contributing
description: How to contribute to the Paperless NGX Dedupe project
---

# Contributing

Thank you for considering contributing to Paperless NGX Dedupe! This guide covers the process for reporting bugs, suggesting features, and submitting code changes.

## Ways to Contribute

- **Bug Reports**: Found a bug? [Open an issue](https://github.com/rknightion/paperless-ngx-dedupe/issues/new) with reproduction steps
- **Feature Requests**: Have an idea? Start a [GitHub Discussion](https://github.com/rknightion/paperless-ngx-dedupe/discussions)
- **Documentation**: Improve or fix documentation (you can edit any page using the pencil icon)
- **Code**: Fix bugs or implement features via pull requests

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
    ```bash
    git clone https://github.com/your-username/paperless-ngx-dedupe.git
    cd paperless-ngx-dedupe
    ```
3. **Install dependencies**:
    ```bash
    pnpm install
    ```
4. **Create a branch** for your changes:
    ```bash
    git checkout -b feat/my-feature
    ```
5. **Make your changes** and verify they work:
    ```bash
    pnpm check    # Type checking
    pnpm lint     # Linting
    pnpm test     # Unit tests
    ```

See the [Development Guide](development.md) for more on the local development workflow.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) with [Release Please](https://github.com/googleapis/release-please) for automated releases. Commit messages should follow this format:

```
type(scope): description

[optional body]
```

**Types:**

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, no code change |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build, CI, or tooling changes |

**Scopes:** `core`, `web`, `sdk`, `cli`, `db`, `dedup`, `sync`, `jobs`, `api`, `docs`

**Examples:**

```
feat(dedup): add support for custom shingle functions
fix(web): prevent duplicate SSE connections on reconnect
docs: update API reference with batch endpoint examples
```

## Pull Request Process

1. Ensure all checks pass: `pnpm check && pnpm lint && pnpm test`
2. Update documentation if your change affects user-facing behavior
3. Write clear commit messages following the convention above
4. Open a pull request with a description of **what** and **why**
5. Respond to review feedback

## Code Style

- **Prettier** handles formatting: 100 char width, single quotes, trailing commas, 2-space indent
- **ESLint** catches code quality issues
- **TypeScript** strict mode is enabled
- Run `pnpm lint:fix && pnpm format:fix` before committing

## License

By contributing, you agree that your contributions will be licensed under the [GNU General Public License v3](https://github.com/rknightion/paperless-ngx-dedupe/blob/main/LICENSE).
