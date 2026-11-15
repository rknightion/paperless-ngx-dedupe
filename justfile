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

# run unit tests for both packages (vitest); pass filter="pattern" to narrow
[group('check')]
[no-exit-message]
test filter="":
    pnpm --filter @paperless-dedupe/core exec vitest run {{ filter }}
    pnpm --filter @paperless-dedupe/web exec vitest run --passWithNoTests {{ filter }}

# run core unit tests with coverage; fails below the thresholds CI enforces
[group('check')]
[no-exit-message]
coverage:
    pnpm --filter @paperless-dedupe/core exec vitest run --coverage

# run web e2e tests (playwright, needs built packages)
[group('check')]
[no-exit-message]
test-e2e:
    pnpm --filter @paperless-dedupe/web test:e2e

# dependency vulnerability scan (matches CI's audit step)
[group('check')]
audit:
    pnpm audit --audit-level=high

# the local gate: what CI's quality and unit-tests jobs run, except the coverage thresholds (see `just coverage`)
[group('check')]
check: fmt-check lint typecheck test

# build both packages in dependency order: core then web
[group('build')]
build:
    pnpm --filter @paperless-dedupe/core build
    pnpm --filter @paperless-dedupe/web build

# start the SvelteKit dev server; use dev-jobs to keep background workers compiled
[group('dev')]
run:
    pnpm dev

# run the dev server and keep compiled background workers current
[group('dev')]
dev-jobs:
    #!/usr/bin/env bash
    set -euo pipefail
    set -m
    pnpm --filter @paperless-dedupe/core exec tsc --watch --preserveWatchOutput &
    watcher_pid=$!
    trap 'kill -- -"$watcher_pid" 2>/dev/null || true; wait "$watcher_pid" 2>/dev/null || true' EXIT
    pnpm dev

# build the local image, then verify it starts and can launch a worker
[group('build')]
docker-validate:
    docker build -t paperless-ngx-dedupe:local .
    bash scripts/verify-image-workers.sh paperless-ngx-dedupe:local

# docker compose dev profile with live rebuild (full workflow incl. background jobs)
[group('dev')]
docker-dev:
    docker compose -f compose.dev.yml --profile dev up dev --build

# GitHub issues and the rknightion Project; maintainers only (needs the tracker tools and credentials)
[group('tracker')]
[positional-arguments]
tracker *args:
    #!/usr/bin/env bash
    set -euo pipefail
    export TRACKER_REPO=rknightion/paperless-ngx-dedupe TRACKER_PROJECT_OWNER=rknightion TRACKER_PROJECT=7
    export TRACKER_ISSUE_IDENTITY=app TRACKER_PROJECT_IDENTITY=user
    exec tracker-with-token "$@"

# print the issue a legacy board id (PND-0001) became
[group('tracker')]
issue id:
    @python3 -c 'import json,sys; m=json.load(open(".github/tracker/id-map.json")); e=m.get("issues",{}).get(sys.argv[1]) or m.get("held",{}).get(sys.argv[1]); print(e["url"] if isinstance(e,dict) and "url" in e else e) if e else sys.exit("unknown legacy id: "+sys.argv[1])' {{ quote(id) }}
