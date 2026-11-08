## What changed

The change in a few sentences, naming the files or areas it touches.

## Why

The problem it solves, with a link to the issue or bug report.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] CI / build / chore

## Verified

What you ran or observed, with before and after where behaviour changed. `just check` is the gate;
for a change to `packages/web` also run `just build` then `just test-e2e`, which CI runs separately.

## Not verified

What you did not run or could not observe. Write "nothing" only if that is true.

## Checklist

- [ ] `just check` passes
- [ ] Tests added or updated where it makes sense
- [ ] The title is a [Conventional Commit](https://www.conventionalcommits.org/) subject
- [ ] Docs (README, `docs/`) updated if behaviour changed

## Issue

<!-- Closes #<number> on a line of its own for each issue of this repository this change completes (Closes owner/repo#<number> means the same). Refs #<number> when it only relates to one. A change with no issue says "Task: none, <reason>" on a line of its own. -->

## Acceptance evidence

<!-- One row per acceptance criterion of every issue this change closes, copied exactly from the issue's "- [ ] ACn" list. Evidence class is code, live or browser. In Proof, put repository paths in backticks, and write anything else (a command, a read-back, a run) without them. Delete the example row. Leave the table out only when the change closes no issue. -->

| Issue | AC | AC text | Evidence class | Proof |
| --- | --- | --- | --- | --- |
| #N | AC1 | The acceptance criterion, word for word | code | `path/to/the.test.ts` what it proves |
