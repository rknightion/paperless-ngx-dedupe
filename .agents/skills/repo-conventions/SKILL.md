---
name: repo-conventions
description: This repository's rules for the general skills vended beside it (write-tests, audit-tests, refactor-clean, write-docs, audit-performance, audit-decisions, find-state-machines). Read it whenever you use one of those skills, and before proving a check red, renaming anything users depend on, writing docs, or recording a decision or performance report. Where it and another skill differ, this skill wins.
license: MIT
---

# Repository conventions for the vended skills

Source: original to rknightion/.github.

Changes from the source: none.

The general skills next to this one come from upstream unchanged. They were written for other
projects, so some advice does not fit here: these projects are released, have users, run on
`just`, and land through pull requests with an acceptance evidence table. This skill holds the
differences. Rules in the repository's `AGENTS.md` still come first.

## write-tests

- When a change needs no new test: documentation, comments, declarative config, CI YAML and
  dependency bumps are validated instead (parse, lint, render, build the docs, `--dry-run`); wiring
  with no branching is covered by the outer test that uses it; never retrofit tests onto code the
  change did not touch, mention the gap instead.
- Fixtures are synthetic: no real host, address, account, device or person.
- Tests write only to a temp directory or a scratch `HOME`, never touch real config, accounts,
  devices or credentials, and stop every process, container and port they start, on failure too.
- A fork pull request's CI has no secrets. A test that needs one skips with a stated reason and is
  never the only proof of the behaviour.
- `just test` runs the suite and `just check` is the full gate. Run `just check` once on the final
  tree.
- Record each proof that closes an acceptance criterion as a row of the pull request's acceptance
  evidence table, with the test path in backticks (format in `commit-and-pr`).

### Red-first restore

Every new or changed check is seen failing for the right reason before it passes:

1. Copy the changed production files aside with their modes (`cp -p`, never the test).
2. `git restore --source=<base> --worktree -- <production paths>`, and move any new untracked
   production file out of the tree (restore cannot remove a file the base never had).
3. Run the check and see it fail for the expected reason. If the red numbers equal the green
   numbers, the pathspec reverted nothing: fix it and rerun.
4. Copy every file back with `cp -p`, delete again any file the change deletes (the restore
   brought it back), run again and see it pass.
5. Confirm `git status` and `git diff --cached` match what they were before.

Never use `git stash` (every worktree of the clone shares it) or `git checkout <base> -- <paths>`
(it rewrites the index).

## audit-tests

Contributors propose a test removal in the pull request with the reasoning; a maintainer decides.
Never weaken, skip or delete a test to get a pass.

## refactor-clean

- Published names are contracts with users nobody can list: package APIs, CLI flags, config keys,
  environment variables, Home Assistant entity and unique ids, metric and label names, chart values.
  Renaming one needs a migration (accept the old name, warn, document the change) and a note in the
  pull request, whatever a skill says about hypothetical callers.
- Never hand-refactor generated, vendored or release-owned files. Change the source and regenerate
  with the recipe `AGENTS.md` names. Release tooling owns the changelog and version files.
- Prove a refactor with `just check`, and use the `refactor:` commit type.

## write-docs

- User-facing reference (metrics, config keys, flags, chart values) stays, generated from the source
  where the repository has a generator.
- Exported symbols carry doc comments that say what the caller needs and why, not how.
- Never add a `ROADMAP.md`. Link to code by repository path, not by line number.
- Docs are read by people: no em dash, en dash or double hyphen in them.

## audit-performance

- Trace the hot paths first: poll and scrape loops, Home Assistant coordinators and anything on the
  event loop, retries, and fan-out per device or per item.
- Honour `Retry-After`. Backoff is capped and jittered. State the worst-case request count per
  rate-limit window.
- Metric labels never carry identifiers, payload content, error text or credentials.
- Keep code evidence separate from live evidence, and never read a live system or account you were
  not given. A changed poll interval, default or metric name is a user-facing change: say so in the
  pull request.

## audit-decisions and audit-performance

- The ledger or report goes in the pull request description, never in a file: no `specs/`,
  `decisions.md`, ledger or roadmap files.
- Needs-owner also covers a change to a published contract and anything outward-facing or
  irreversible.
- The pull request is public: no personal data, credentials or real identifiers in the ledger.

## find-state-machines

Propose a larger restructure in the pull request rather than asking someone; small fixes inside the
change's scope go in directly.
