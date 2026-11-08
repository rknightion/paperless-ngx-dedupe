---
name: verification-before-completion
description: Run the command that proves a claim and read its output before saying work is complete, fixed, passing or ready. Maps each kind of claim to the evidence that proves it and to what is not enough, and sets how much checking a change needs. Use before any success claim, before a commit or pull request, before ticking an acceptance criterion, and before trusting another agent's report that it is done.
license: MIT
---

# Verification before completion

Source: https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md

Changes from the source: the generic claims table is replaced by one built on the repository's
`just` recipes, its pull request checks and the code, live and browser evidence classes; added a
proportionate gate, the list of changes that are validated rather than tested, the red-first proof
procedure and fork pull request rules.

Inside the owner's agent loop, the repository's `LOOP.md` overrides this skill where they differ.

## The rule

No completion claim without fresh evidence from this tree. If you have not run the proving command
since your last edit, you cannot say it passes. "Should", "probably" and "seems to", and any
satisfaction expressed before the run, are signs you are about to claim without evidence. A check
that passes on its first run against unchanged code has probably asserted nothing: make it fail for
the right reason first.

## The gate

1. Name the claim.
2. Name the command that proves it (table below).
3. Run it fresh and in full, with stdin from `/dev/null` for `just` and a timeout.
4. Read the whole output and the exit code. A runner that prints nothing and a green run look alike.
5. State the claim with its evidence, or state the real status.

A summary from another agent is not evidence: read `git diff` and run the proving command yourself.

## How much to run

- In the inner loop, run the narrowest check that exercises the change: one test, one package, one
  file.
- Run `just check` once on the final tree, with a timeout. A slow tier the repository's `AGENTS.md`
  names may be left to pull request CI, and the pull request says so.
- A repaired tree is a new tree: rerun the failing part, then the gate once more.
- Documentation, comments, declarative config, CI YAML and dependency bumps are proved by
  validation (parse, lint, render, `--dry-run`, `just fmt-check` and `just lint`), not by new tests.

## Evidence classes

An acceptance criterion is proved by one class.

- **code**: test, package or gate output on this tree.
- **live**: a deployed environment read back (served response, stored state, applied config).
  Only maintainers reach those environments. A contributor does not claim it, and says in the pull
  request that live evidence is pending and what a maintainer must read back.
- **browser**: a real browser driving the built app. A component test, a type check or a build is
  not browser evidence.

## Claim to evidence

| Claim | Proof | Not enough |
|---|---|---|
| Tests pass | the test command's output on this tree, exit 0, zero failures | an earlier run, "should pass" |
| A bug is fixed | a test that fails on the base for the right reason and passes on your tree | "the code changed", a test that never failed |
| A red-first proof is real | the procedure below, with the red run failing on the expected assertion | a test written after the fix and run once |
| Lint or format is clean | `just lint` and `just fmt-check`, exit 0 | a partial run, an editor that shows no warnings |
| The local gate is green | `just check` exit 0 on the exact tree you hand over | a gate on a tree you then edited, a subset of its recipes |
| CI is green | every required check passed on the exact pushed head | an earlier head, a check that did not run |
| A config, chart, workflow or docs change works | the repository's validator for it (render, lint, parse, docs build) exit 0 | reading the file |
| The UI works | a browser run, named in the pull request | a build, unit tests |
| It works where it is deployed (maintainers) | the environment read back | green CI, a ready pod, an HTTP 200 |
| Another agent or reviewer passed it | its findings checked in the code | "PASS" without reading them |
| Text is free of private data | the repository's privacy sweep, if it has one (`python3 .github/privacy/sweep --staged`) | a diff that looks clean |
| An issue is done | each acceptance criterion checked against its own evidence, row by row, in the pull request's evidence table, and the acceptance evidence check green | "tests pass, so it is complete" |

## Red-first proof

Copy the changed production files aside (never the test), then
`git restore --source=<base> --worktree -- <production paths>`, run the test (red), copy your files
back, run it (green), and confirm `git diff --cached` is unchanged. Do not use `git stash`: every
worktree of the clone shares it. Do not use `git checkout <base> -- <paths>`: it rewrites the index.
If the red numbers equal the green numbers, the restore did not take.

## Checks that did not run

A timeout, a cancelled run, a skipped job or a missing required check is not a pass. A fork pull
request gets no secrets, so a job that needs one may skip; a first-time contributor's workflows wait
for a maintainer to approve the run. Say which checks have not run and why. A red that also fails on
the base is not yours: report both runs.

## Before you hand back

Confirm the tree you ran is the tree you are handing over (`git status --porcelain`,
`git diff <base>`), that nothing outside your scope changed, and that your report names every command
you ran, its exit code and the last lines of its output. Whatever you did not run is named, never
implied green.
