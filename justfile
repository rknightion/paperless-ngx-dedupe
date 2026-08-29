set shell := ["bash", "-euo", "pipefail", "-c"]

# show the task surface
default:
    @just --list

# install pnpm workspace dependencies (idempotent, frozen lockfile)
setup:
    pnpm install --frozen-lockfile

# format source in place (prettier)
[group('check')]
fmt:
    pnpm format:fix
    @just --fmt

# verify formatting without mutating (prettier + just --fmt)
[group('check')]
[no-exit-message]
fmt-check:
    pnpm format
    just --fmt --check

# lint with eslint
[group('check')]
[no-exit-message]
lint:
    pnpm lint

# type-check both packages (core then web, dependency order)
[group('check')]
[no-exit-message]
typecheck:
    pnpm --filter @paperless-dedupe/core check
    pnpm --filter @paperless-dedupe/web check

# run core unit tests (vitest); pass filter="pattern" to narrow
[group('check')]
[no-exit-message]
test filter="":
    pnpm --filter @paperless-dedupe/core exec vitest run {{ filter }}

# run web e2e tests (playwright, needs built packages)
[group('check')]
[no-exit-message]
test-e2e:
    pnpm --filter @paperless-dedupe/web test:e2e

# dependency vulnerability scan (matches CI's audit step)
[group('check')]
audit:
    pnpm audit --audit-level=high

# the full local gate — exactly what CI's quality + unit-tests jobs enforce
[group('check')]
check: fmt-check lint typecheck test

# build both packages in dependency order: core then web
[group('build')]
build:
    pnpm --filter @paperless-dedupe/core build
    pnpm --filter @paperless-dedupe/web build

# start the SvelteKit dev server (http://localhost:5173) — background jobs need docker-dev instead
[group('dev')]
run:
    pnpm dev

# build the local image and run it via compose with a health check
[group('build')]
docker-validate:
    docker build -t paperless-ngx-dedupe:local .
    docker compose -f compose.dev.yml up --force-recreate --abort-on-container-exit

# docker compose dev profile with live rebuild (full workflow incl. background jobs)
[group('dev')]
docker-dev:
    docker compose -f compose.dev.yml --profile dev up dev --build
