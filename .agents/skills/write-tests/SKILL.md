---
name: write-tests
description: Write tests that pin real behaviour instead of implementation details, config values or lucky samples, and only the tests a change needs. Use when adding tests for new behaviour, writing a red-first regression test, fixing a brittle or flaky test, reviewing a test diff, deciding whether a change needs a test at all, or when a test breaks after a refactor or config change that did not change behaviour.
license: MIT
---

# Write tests

Source: https://github.com/dzhng/skills/tree/main/skills/engineering/write-tests

Changes from the source: added the rule for when a change needs no new test and when one is worth
writing, the evidence table that carries each proof, the synthetic-fixture rule and a red-first
restore procedure without `git stash`; the desktop-focus section is generalised to tests that run
on someone's machine and in shared CI.

Inside the owner's agent loop, the repository's `LOOP.md` overrides this skill where they differ.

A good test fails only when real behaviour breaks, and passes through every refactor or config
change that preserves it. Most bad tests fail the other way: red on harmless changes, green while
the real path is broken. Every rule below serves that goal.

Default to a test through the outermost practical entry point (the CLI, an HTTP handler, a Worker's
fetch handler, a Home Assistant config flow or platform setup, a rendered chart, a rendered page).
Use an isolated unit test only for specific, complex logic where fast feedback materially speeds
development. To decide whether coverage adds independent proof, or which existing tests can go, use
`audit-tests`.

## Whether to write one

- Before adding a test, name in one sentence the bug it would catch. If you cannot, do not add it.
  Extend an existing test that covers the behaviour before adding a sibling.
- Documentation, comments, declarative config, CI YAML and dependency bumps get no new tests. Prove
  them by validation instead: parse, lint, render, build the docs, `--dry-run`.
- Wiring with no branching (a field passed through, a registry entry, a re-export) needs no test of
  its own; the outer test that uses it covers it.
- Do not retro-fit tests onto code the change did not touch; mention the gap instead.
- Defects, not diligence: a test per permutation where three cases pin the contract, tests of what
  the type checker or framework already guarantees, snapshots that only record current output,
  tautologies (a constant against its own literal, a mock echoing what it was told).

## Where tests live and how to run them

The repository's `AGENTS.md` names its test layout and any slow tier. `just test` runs the suite and
`just check` is the full local gate. In the inner loop run one file or one test name with the
language's own runner (for example `go test -count=1 -run '^TestName$' ./pkg/x`,
`pytest path/to/test_file.py::test_name`, or the TypeScript runner's file filter), with a timeout.
Check the exit code, not just the output: a runner that prints nothing and a green run look alike.
Run `just check` once on the final tree; a slow tier the `AGENTS.md` names may be left to pull
request CI, and the pull request says so.

When the test proves an acceptance criterion, name it in the pull request's evidence table with its
path in backticks, so the check can confirm the file exists (see `commit-and-pr`).

## Workflow: one test at a time

1. Write one test. Watch it go red on the unfixed code, make the code earn green, then write the
   next. A batch written against imagined behaviour pins what you guessed.
2. Iterate on the fastest focused runner. On failures, read every red test before fixing one; they
   often share a cause.
3. Before calling it done, prove the test can fail (below) and walk the review checklist.

## What to assert

- **Observable behaviour**: return values, exit codes, persisted rows, HTTP responses, entity state,
  rendered output. Never which internal functions ran or how a value is computed.
- **Nothing the compiler already guarantees.** Spend the budget on business rules, arithmetic,
  branching, ordering, edge cases and side effects.
- **Not presentation.** Class names, styles and copy checked as strings only repeat the source. Check
  appearance by looking at it, with a visual test where the repository has one.
- **Actual values, not collection sizes.** On dedup, normalise and idempotency paths, `len == 1`
  passes when normalisation is broken; also assert the stored canonical value.
- **Small scenarios.** The minimum data and mechanisms that prove the behaviour.
- **The contract, not current behaviour.** When a test goes red, the reflex is to re-measure and pin
  the new number. Write the assertion from the stated contract (the issue's acceptance criteria, the
  docs, the API schema) and make the code earn it. If no contract exists, ask the owner rather than
  pinning a number.
- **Deterministic claims tight, stochastic claims as distributions.** A single-sample pin on a noisy
  outcome certifies whatever the lucky sample did. Assert a band over many seeds and name the margin
  in a comment.

## Seams and mocks

- **Do not couple tests to config; fake the seam.** A test keyed to a live config value breaks when
  someone legitimately edits config. Feed fixed inputs or stub the lookup. Never skip or condition an
  assertion on config. Litmus: would this break if a config value changed with no logic change?
- **A test sets the bounds it depends on.** Timeouts, limits, quotas and thresholds get retuned. A
  boundary test uses a fake whose numbers it defines and probes either side; any other test runs far
  from every bound.
- **Mock at the system's edges** (clock, randomness, network, filesystem, subprocesses, a vendor API,
  a device), never internal collaborators. Never make "was called with" the main assertion when an
  observable outcome exists. Mocking three internal modules to test one function means testing one
  layer up.
- **Harnesses wire the system as production does.** If a bug showed only against a real
  environment, the harness skipped an input production always sets. Fix the harness too.
- **Fixtures are synthetic.** Personal data, credentials and real identifiers (hostnames, IP
  addresses, account IDs, serial numbers, email addresses) never enter a fixture, test or golden
  file. Write the shape, not the instance.

## Control variables and probes

- **One variable per comparison.** Pin everything else: same seed, same counts, same configuration
  on both arms. When a comparison test breaks, first ask whether an unrelated mechanism leaked in.
- **Validate, do not assume.** Do not reason your way to a cause and act on it. Write a throwaway
  probe that reads state and prints. Keep probes out of the tree you commit; delete them once the
  question is answered, or promote one into a real test.

## Tests run on someone's machine and in shared CI

- Write nowhere a person keeps their own state: a temp directory, a scratch `HOME`, a scratch
  database. Never modify real config, never call a real account or device, never use a real
  credential.
- Every process, container, port and temp file a test starts is stopped and removed, on failure too.
- A fork pull request's CI has no secrets, so a test that needs one must skip with a stated reason
  and must not be the only proof of the behaviour.
- Never loosen, skip or quarantine an assertion or a timeout to get green.

## Prove the test can fail

A test you never saw fail is decoration. Falsify every regression test once: break the production
code the way the bug would, confirm red for the expected reason, restore, confirm green.

- Copy the changed production files aside (never the test),
  `git restore --source=<base> --worktree -- <production paths>`, run, copy your files back, and
  confirm `git diff --cached` is unchanged. Do not use `git stash`: every worktree of the clone
  shares it. `git checkout <base> -- <paths>` rewrites the index too.
- Check the revert took: a wrong pathspec reverts nothing and the "red" run tests the fixed code.
  The tell is red numbers equal to green numbers.

## When a test goes red after a change

Triage before editing anything:

1. The test encodes **deleted semantics**, an accident of the old implementation. Re-spec it to the
   contract's real claim and name the changed test in the pull request.
2. The experiment **lost control of a variable**. Pin it.
3. The **margin was too tight** for a noisy outcome. Widen it, with a comment saying so.
4. The code is **actually wrong**. Probe the state and find the mechanism.

Never tune constants to pass one test without rerunning its neighbours. If two consecutive tweaks
each break a different test, stop: the control surface is wrong.

## Review checklist

1. Can you name the bug it catches? If not, delete it.
2. Does an assertion restate a type guarantee? Delete it.
3. Would it break on a config edit with no logic change, or skip on config? Fake the seam.
4. Are assertions mostly mocked-internal "called with"? Test a layer up against output.
5. Does it pin one sample of a stochastic outcome? Assert a distribution.
6. Does it assert a count without the value on a dedup or normalise path? Add the value.
7. Is the function under test still called in production? If only tests call it, delete both.
8. Can it fail for the right reason? Falsify once.
9. Does it carry a real host, address, account or person? Replace it with a synthetic one.
10. Does it check a class name, style or line of copy as a string? Delete it.
