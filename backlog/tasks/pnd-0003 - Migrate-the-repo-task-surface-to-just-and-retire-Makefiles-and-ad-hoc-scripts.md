---
id: PND-0003
title: Migrate the repo task surface to just and retire Makefiles and ad-hoc scripts
status: To Do
assignee: []
created_date: '2026-08-28 19:23'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# Migrate paperless-ngx-dedupe task surface to `just`

Follow the fleet `just` standard (mandatory vocabulary, groups, header, authoring rules, migrate-vs-keep
rule, CI integration rules) exactly as frozen. Do not re-litigate it. This repo has **no Makefile** —
the task surface today is `package.json` scripts (root + two pnpm workspace packages) plus a small set
of shell scripts, none of which are dev/CI task orchestration.

## Outcome

A top-level `justfile` becomes the one true task surface: `just --list` shows `setup`, `fmt`,
`fmt-check`, `lint`, `test`, `check`, `typecheck`, `build`, `dev`, `test-e2e`, `docker-validate`,
`docker-dev`, `audit`. `just check` is exactly what CI's `quality` + `unit-tests` jobs enforce. Root
`package.json` `scripts` block stays (pnpm workspace filtering still needs it internally, and `just`
recipes call `pnpm` under the hood) but is no longer the documented entry point — AGENTS.md, README.md
and `backlog/config.yml` all point at `just` instead. `docker-entrypoint.sh`, `add-correspondent.sh`,
`add-tags.sh`, and `scripts/cloud-environment-setup.sh` are untouched — none of them are dev/CI task
orchestration, all four are explicitly out of scope (see §10 below). `ci.yml`'s `quality` and
`unit-tests` jobs call `just` recipes instead of raw `pnpm`; every other workflow file is untouched.

## The complete justfile

Drop this at the repo root as `justfile`. Adjust only if a command in Step 2 verification does not
match what's actually in this repo at implementation time (toolchain versions, script names).

```just
set shell := ["bash", "-euo", "pipefail", "-c"]

# show the task surface
default:
    @just --list

# install pnpm workspace dependencies (idempotent, frozen lockfile)
[group('dev')]
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
```

Notes on choices baked into this file (do not change without re-checking against the standard):

- `fmt` runs `pnpm format:fix` (prettier `--write`) then `just --fmt` (formats the justfile itself)
  per §5.10 / §10.
- `fmt-check` runs `pnpm format` (prettier `--check .`, the existing script name — it is already the
  check variant, not the fix variant) then `just --fmt --check`.
- `lint`, `typecheck`, `test`, `test-e2e` all get `[no-exit-message]` per §5.5 — eslint, tsc/svelte-check
  and vitest/playwright all print their own useful failures; just's added `error: recipe X failed on
  line N` is redundant noise on top.
- `test` takes an optional `filter=""` per the mandatory-recipe contract (§1) — vitest accepts a
  trailing positional test-name-pattern argument, so an empty string is a no-op filter.
- `check: fmt-check lint typecheck test` matches CI's `quality` job (`pnpm lint && pnpm format &&
  pnpm check`) plus `unit-tests` (`vitest run`). `audit` is deliberately **not** in `check` — CI runs
  it with `continue-on-error: true`, i.e. it's advisory, not gating; keep it optional per §1's "no
  meaningful content" carve-out inverted (it has content, it's just non-gating in CI so it must not be
  gating locally either, or `just check` would fail on findings CI itself tolerates).
- `docker-validate` and `docker-dev` map straight from the two `pnpm docker:*` scripts and stay in
  `build`/`dev` groups respectively — no `[confirm]` needed, `docker-validate` doesn't push or mutate
  anything remote, it's a local build+run+teardown.
- `build` is optional-vocabulary (§2) but genuinely used here — keep it named `build`, not `gen` (this
  repo builds compiled output, it does not regenerate committed source).
- No `ci` recipe: CI's job set (`quality`, `unit-tests`, `e2e-tests`, `docker-build-verify`) is not a
  strict superset of `check` doing extra *local* work — `e2e-tests` and `docker-build-verify` need a
  built image / Playwright browsers CI already provisions in dedicated steps, and `test-e2e` is
  already exposed as its own recipe rather than folded silently into `check` (it needs a prior `build`
  and is slow — see Traps).

## Makefile disposition

None. `find . -iname Makefile -o -iname GNUmakefile` (excluding `node_modules`) returns nothing in
this repo. Nothing to delete, no table needed.

## Script disposition

| Script | Verdict | Recipe / reason |
|---|---|---|
| `docker-entrypoint.sh` | KEEP | Shipped runtime artifact — `Dockerfile`'s `ENTRYPOINT`, runs inside the built container on a target machine with no `just`. Never called from a dev/CI task. |
| `add-correspondent.sh` | KEEP | Standalone operator utility that bulk-creates correspondents against a *live external* Paperless-NGX instance via its own hardcoded URL/token — not a repo dev/CI task, has no repo-relative meaning, and is invoked ad hoc by a human, not by `setup`/`build`/`test`/CI. |
| `add-tags.sh` | KEEP | Same as `add-correspondent.sh` — standalone operator utility against a live external instance, non-trivial control flow (comma-split parsing loop), invoked ad hoc. |
| `scripts/cloud-environment-setup.sh` | KEEP | Real program: functions (`log`, `as_root`, `install_node`), a `trap`, an architecture-detection `case`, an HTML-scraping `curl`+`sha256sum` verification step, and a retry loop. Its own header says `CLOUD AGENTS ONLY: local agents must not execute this`. It is invoked by the cloud-agent bootstrap mechanism, not by a developer or CI (§6 "scripts invoked by something other than a developer or CI") — do not fold it into `setup` and do not have `setup` call it. |

No scripts are absorbed. All four are real programs, shipped artifacts, or externally-invoked
bootstrap — none is a thin sequencing wrapper.

## CI changes

Only `.github/workflows/ci.yml` changes. Every other workflow file
(`arm-automerge.yml`, `auto-rc.yml`, `docker-security.yml`, `ghcr-cleanup.yml`, `publish.yml`,
`release-please.yml`, `scorecard.yml`, `trigger-docs-sync.yml`) is GitHub-native or a reusable-workflow
`uses:` call and must not be touched (see §10).

### `.github/actions/setup-node-pnpm/action.yml`

This composite action is used by every `ci.yml` job via `uses: ./.github/actions/setup-node-pnpm`.
Add the `setup-just` step here (once, shared by every consumer) and switch its install step to call
the new recipe:

```yaml
name: Setup Node.js with pnpm
description: Set up pnpm + Node.js and install dependencies (frozen lockfile)

runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10

    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: 24
        cache: pnpm

    - uses: extractions/setup-just@<pin-exact-sha> # v4
      with:
        just-version: '1.58.0'

    # Install directly rather than restoring a cross-job node_modules cache: pnpm rewrites
    # pnpm-lock.yaml during install, so the install job's post-install hashFiles() key never
    # matched the consumers' fresh-checkout key — every consumer missed the cache and ran with
    # an empty node_modules (eslint/vitest/playwright "not found"). The pnpm store cache above
    # keeps this fast.
    - name: Install dependencies
      shell: bash
      run: just setup
```

Resolve `<pin-exact-sha>` for `extractions/setup-just` at implementation time (`gh api
repos/extractions/setup-just/git/refs/tags/v4` or similar) and pin it with a `# v4` trailing comment
matching this repo's existing SHA-pin convention (see every other `uses:` line in `ci.yml`).

### `.github/workflows/ci.yml` — `quality` job

Before:
```yaml
      - uses: ./.github/actions/setup-node-pnpm
      - run: pnpm lint
      - run: pnpm format
      - run: pnpm check
      - name: Audit dependencies
        run: pnpm audit --audit-level=high
        continue-on-error: true
```

After:
```yaml
      - uses: ./.github/actions/setup-node-pnpm
      - run: just lint
      - run: just fmt-check
      - run: just typecheck
      - name: Audit dependencies
        run: just audit
        continue-on-error: true
```

Do not collapse these four into a single `run: just check` — keep them as separate steps so CI's
per-step annotations/timing stay granular and `continue-on-error` stays scoped to audit alone. (`just
check` itself must still be proven to equal this sequence locally per Order of Work below — the point
is CI keeps step granularity, not that it stops matching `check`.)

### `.github/workflows/ci.yml` — `unit-tests` job

Before:
```yaml
      - name: Run unit tests with coverage
        run: |
          pnpm --filter @paperless-dedupe/core exec vitest run --coverage --reporter=default --reporter=junit --outputFile.junit=./test-results/junit.xml
```

Leave this step's `run:` **unchanged**. It passes `--coverage --reporter=default --reporter=junit
--outputFile.junit=...` flags that `just test` does not carry (and should not — those flags are
CI-reporting-specific, not part of the developer-facing gate). Do not force this into `just test`;
a recipe's job is the developer/local gate, not to reproduce every CI reporting flag. This is a
deliberate exception — call it out explicitly if a reviewer asks why this one `run:` didn't collapse.

### `.github/workflows/ci.yml` — `e2e-tests` job

The "Build packages" step (`pnpm --filter @paperless-dedupe/core build && pnpm --filter
@paperless-dedupe/web build`) becomes:
```yaml
      - name: Build packages
        run: just build
```
The "Run E2E tests" step (`pnpm test:e2e`) becomes:
```yaml
      - name: Run E2E tests
        run: just test-e2e
```
Leave the Playwright browser install/cache steps in this job untouched — they are CI-environment
provisioning (browser binaries + OS deps), not a repo task a developer runs locally, and are already
env-gated (`if: steps.playwright-cache...`) in ways that don't map to a single recipe.

### `.github/workflows/ci.yml` — `docker-build-verify` job

Leave untouched. Its Docker Buildx setup (with OTEL env wiring for build tracing), health-check polling
loop, and cleanup step are CI-specific orchestration around `docker/build-push-action`, not a
`pnpm`/script command this migration is chartered to touch. `docker-validate` (the new recipe) is the
local equivalent a developer runs; it is not what CI's job does line-for-line and should not be forced
to match.

### `.github/workflows/ci.yml` — `source-maps` job

The "Build with source maps" step (`run: pnpm build`, with `FARO_SOURCEMAP_API_KEY` env) becomes:
```yaml
      - name: Build with source maps
        run: just build
        env:
          FARO_SOURCEMAP_API_KEY: ${{ secrets.FARO_SOURCEMAP_API_KEY }}
```
Env passthrough is unaffected — `just` recipes inherit the step environment (§8).

### What must NOT change in `ci.yml`

- The `ci-success` job and its `needs: [quality, unit-tests, e2e-tests, docker-build-verify]` list —
  branch ruleset gates on this exact check name.
- `permissions:` blocks on every job.
- `concurrency:` group at the top of the file.
- `persist-credentials: false` on every `actions/checkout`.
- Every SHA-pinned `uses:` line and its trailing `# vX.Y.Z` comment.
- The `coverage-summary` job (downloads artifacts, no build/test logic to collapse).
- Job names, `needs:` graphs, `if:` conditions, `timeout-minutes:`, matrix-free structure — none of
  this changes.

## Docs and agent-contract changes

### `AGENTS.md`

Replace the `## Commands` section (currently lines ~35–47, the fenced `pnpm ...` block) and the
`## Workflow` line (`Run \`pnpm lint && pnpm format --write && pnpm check && pnpm test\` after
completing work or before pushing...`) with the fleet-standard Task interface block:

```markdown
## Task interface

This repo's task surface is a `justfile`. Discover it, don't guess it:

    just --list                        # human-readable
    just --dump --dump-format json     # machine-readable
    just --show <recipe>               # what a recipe actually runs

- `just check` is the full gate and is exactly what CI enforces. It must pass before you commit.
- Prefer `just <recipe>` over the underlying tool. If you are typing `pnpm test`, you want `just test`.
- Run `just` with stdin from /dev/null. No recipe in this repo is marked `[confirm]` today; if one is
  added later, stop and ask before running it — never pass `--yes` or `JUST_YES=1`.
- If a task you need does not exist, add a recipe with a `#` doc comment and a `[group(...)]` rather
  than running a bare command.
```

Keep the rest of `AGENTS.md` (`## Architecture`, `## Quality Checks`, `## Code Style`, `## Svelte 5
Conventions`, `## Debugging Guidelines`, `## Gotchas & Constraints`) unchanged — they're not
task-surface content. Do not paste the recipe list into this file (§9).

### `README.md`

Lines ~68–76 currently read:
```
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:5173)
pnpm build            # Production build
pnpm check            # TypeScript type checking
pnpm lint             # Lint
pnpm test             # Run tests
```
Replace with:
```
just setup            # Install dependencies
just run              # Start dev server (http://localhost:5173)
just build            # Production build
just typecheck        # TypeScript type checking
just lint              # Lint
just test             # Run tests
```
Keep the note immediately after about `pnpm docker:dev` / background jobs, but update the command
name to `just docker-dev`.

### `backlog/config.yml`

See next section — this also counts as a docs/contract change since it's what `backlog task` surfaces
as the definition of done.

## backlog/config.yml

Current:
```yaml
definition_of_done:
  - "pnpm lint && pnpm format --write && pnpm check && pnpm test"
  - "pnpm build (core then web, in dependency order)"
  - "pnpm test:e2e (only if packages/web behaviour changed)"
```
New:
```yaml
definition_of_done:
  - "just check"
  - "just build"
  - "just test-e2e (only if packages/web behaviour changed)"
```
Edit this file through the `backlog` CLI's config path if it exposes one; if `backlog` has no CLI verb
for editing `config.yml` fields, this is the one exception where direct edit is correct — `config.yml`
is Backlog.md's own settings file, not a task/doc record, and the operating rule "never hand-edit a
tracker's markdown; drive it through its CLI" is about task/doc content, not this settings file. State
in the PR/commit which route was used.

## Order of work

1. Write the `justfile` at repo root exactly as specified above.
2. Run `just --fmt --check` — must pass with zero diff (the file above is pre-formatted; if it
   doesn't, run `just --fmt` once and re-diff to confirm idempotence).
3. Run `just setup` on a clean-ish checkout (or accept the already-installed `node_modules` — `pnpm
   install --frozen-lockfile` is idempotent either way) and confirm it succeeds.
4. Run `just fmt-check`, `just lint`, `just typecheck`, `just test`, `just audit`, `just build` each
   standalone and confirm each matches what the corresponding `pnpm` command currently does (same
   pass/fail, same output shape).
5. Run `just check` and confirm it runs `fmt-check lint typecheck test` in that order and the
   aggregate result matches running the CI `quality` + `unit-tests` steps by hand.
6. Run `just test-e2e` after `just build` and confirm it matches `pnpm test:e2e`.
7. Run `just docker-validate` and `just docker-dev` (or at minimum dry-review them against the
   existing `pnpm docker:*` scripts — they are unchanged commands, just relocated) to confirm the
   compose files and flags are identical to today's `package.json` scripts.
8. Only once step 2–7 are all green locally: edit `.github/actions/setup-node-pnpm/action.yml` to add
   the `setup-just` step and switch install to `just setup`.
9. Edit `.github/workflows/ci.yml`'s `quality`, `unit-tests` (leave `run:` unchanged, see above),
   `e2e-tests`, and `source-maps` jobs per "CI changes" above.
10. Push a branch, let CI run, confirm `ci-success` still passes and job step output for `quality`/
    `e2e-tests`/`source-maps` shows the new `just <recipe>` invocations succeeding identically to the
    old `pnpm` calls.
11. Edit `AGENTS.md`, `README.md` per "Docs and agent-contract changes" above.
12. Edit `backlog/config.yml`'s `definition_of_done` per above.
13. There is nothing to delete — no Makefile exists, and every script is a KEEP. Do not run any `git
    rm` as part of this task; if a later audit finds a genuinely orphaned script, that's a separate
    task, not this one.

Do not reorder: justfile-and-local-proof always precedes CI wiring, which always precedes docs, so the
repo is never red between commits.

## Traps specific to this repo

- **`just test`'s optional `filter` param is positional, not a flag.** Vitest's CLI takes a bare
  trailing pattern argument (`vitest run <pattern>`), not `--filter`. `just test foo` must expand to
  `vitest run foo`, not `vitest run --filter foo` — the recipe body above already gets this right
  (`vitest run {{ filter }}`); do not "fix" it into a flag.
- **`pnpm --filter <pkg>` is pnpm's workspace filter, unrelated to `just`'s `filter=""` param name.**
  Don't let the coincidental name collision cause a recipe to try to thread the `just` filter param
  into pnpm's `--filter`; they operate on different axes (package selection vs. test-name selection).
- **`build` must stay two sequential `pnpm --filter` lines, not `pnpm build`.** The root `pnpm build`
  script already does this (`pnpm --filter core build && pnpm --filter web build`), but do not
  collapse the recipe to `pnpm build` — keep the two explicit lines so the dependency order (core
  before web, because web imports core's built output) is visible in the justfile itself and not
  hidden inside a root package.json script an agent has to go read separately.
- **`e2e-tests` in CI needs a prior build; `test-e2e` alone does not build for you.** `just test-e2e`
  is exposed standalone (matching `pnpm test:e2e`) but a developer running it cold against an
  un-built `packages/web` will get stale/missing dist output. This mirrors existing behavior
  (`pnpm test:e2e` has the same precondition today) — not a regression, but worth a one-line note if
  documenting locally: run `just build` first.
- **Coverage-flag CI step is a deliberate non-collapse, not an oversight** — see "unit-tests job"
  above. Do not later "complete" the migration by forcing that `run:` into `just test`; the flags are
  CI-artifact-specific (junit XML path, coverage reporter) and don't belong in the developer-facing
  recipe.
- **`docker-validate` and `docker-dev` need Docker/Docker Compose on PATH** — no `require('docker')`
  guard is included above because none of the other repo-real-command recipes use `require()` either
  and adding it asymmetrically would be inconsistent; if a reviewer wants fail-fast guards added
  fleet-wide, that's a standard amendment, not a per-repo addition here.
- **`node >=24.0.0` is a hard requirement** (`package.json` `engines`, `AGENTS.md` gotcha). `just
  setup` doesn't install/verify Node — that's `scripts/cloud-environment-setup.sh`'s job for cloud
  agents (KEEP, out of scope) and CI's `actions/setup-node` step for CI. A local developer is assumed
  to already have Node 24 the same way they are today; this migration doesn't change that contract.
- **`.env` is required for `docker-validate`/`docker-dev`** (`env_file: .env` in both compose files,
  `.env.example` provided). Not this migration's concern — same precondition existed before via the
  `pnpm docker:*` scripts.

## Out of scope

- **Every workflow file except `ci.yml`**: `arm-automerge.yml`, `auto-rc.yml`, `docker-security.yml`,
  `ghcr-cleanup.yml`, `publish.yml`, `release-please.yml`, `scorecard.yml`, `trigger-docs-sync.yml`.
  All are either pure reusable-workflow `uses:` calls to `rknightion/.github` (release-please's
  publish fan-out, auto-rc, arm-automerge, ghcr-cleanup, scorecard) or GitHub-native security scanning
  with SARIF upload (docker-security's hadolint/trivy jobs). None contain `run:` blocks with
  build/test/lint/format/generate logic to migrate. **Never convert a `uses:` into `run: just`.**
- **`docker-entrypoint.sh`** — shipped runtime artifact, `Dockerfile` `ENTRYPOINT`, executes on a
  target machine with no `just`. KEEP, no recipe wraps it (it isn't a dev/CI task).
- **`add-correspondent.sh`, `add-tags.sh`** — standalone operator utilities against a live external
  Paperless-NGX instance, invoked ad hoc by a human, not part of the dev/CI task surface. KEEP,
  untouched, no recipe wraps them (they take positional args in a way that doesn't map cleanly to a
  `just` recipe anyway, and wrapping them would imply they're a repo dev task, which they aren't).
- **`scripts/cloud-environment-setup.sh`** — cloud-agent-only bootstrap, explicitly says so in its own
  header comment. KEEP, untouched, not called from `setup` or from CI.
- **Dockerfile, Dockerfile.dev** — no `just` involvement; unchanged.
- **`.github/actions/setup-node-pnpm/action.yml` beyond the two edits specified** (adding
  `setup-just`, switching the install `run:` line) — the `pnpm/action-setup` and `actions/setup-node`
  steps, their pins, and their `with:` blocks are untouched.
- **`backlog/config.yml` fields other than `definition_of_done`** — `project_name`, `statuses`,
  `task_prefix`, etc. are untouched.
- **`renovate.json`, `.codacy.yaml`, `.codacy/`, `docs.toml`, `docs/`** — no task-runner content, out
  of scope entirely.
- **Root `package.json` `scripts` block and both packages' `package.json` `scripts` blocks** — kept
  as-is. `just` recipes call `pnpm`/`pnpm --filter` directly; the pnpm scripts remain the underlying
  mechanism, they're just no longer the *documented* entry point. Do not delete or rewrite them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Top-level justfile exists with all seven mandatory recipes (default, setup, fmt, fmt-check, lint, test, check) plus typecheck, build, run, test-e2e, audit, docker-validate, docker-dev
- [ ] #2 just check runs fmt-check lint typecheck test as a dependency list and passes locally, matching exactly what ci.yml's quality and unit-tests jobs enforce
- [ ] #3 just --fmt --check passes with zero diff
- [ ] #4 just --list shows a # doc comment and a [group(...)] for every public recipe, and lint/typecheck/test/test-e2e carry [no-exit-message]
- [ ] #5 No Makefile exists in the repo (none exists today — confirmed no new one is introduced)
- [ ] #6 docker-entrypoint.sh, add-correspondent.sh, add-tags.sh, and scripts/cloud-environment-setup.sh are all left in place untouched and unwrapped, per their KEEP classification
- [ ] #7 .github/actions/setup-node-pnpm/action.yml installs just via extractions/setup-just pinned to an exact version and SHA, and its install step calls just setup
- [ ] #8 ci.yml's quality, unit-tests (build/e2e steps), e2e-tests, and source-maps jobs call just recipes instead of raw pnpm, while the ci-success aggregator, its needs list, permissions blocks, concurrency group, persist-credentials: false, and every other workflow file (arm-automerge.yml, auto-rc.yml, docker-security.yml, ghcr-cleanup.yml, publish.yml, release-please.yml, scorecard.yml, trigger-docs-sync.yml) remain unchanged
- [ ] #9 AGENTS.md and README.md no longer document raw pnpm commands as the primary task interface and instead point at just --list / just --show
- [ ] #10 backlog/config.yml's definition_of_done names just check, just build, and just test-e2e instead of pnpm commands
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 pnpm lint && pnpm format --write && pnpm check && pnpm test
- [ ] #2 pnpm build (core then web, in dependency order)
- [ ] #3 pnpm test:e2e (only if packages/web behaviour changed)
<!-- DOD:END -->
