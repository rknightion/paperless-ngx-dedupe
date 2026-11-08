---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when asked to diagnose or debug something, or when something is reported broken, throwing, failing, stuck, wrong or slow. Builds a fast, red-capable feedback loop before any theory, then reproduces, minimises, tests ranked hypotheses, fixes with a regression test and cleans up, with a redaction rule for secrets and personal data.
license: MIT
---

# Diagnosing bugs

Source: https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs

Changes from the source: the glossary and ADR pointers are replaced by the repository's `AGENTS.md`
and docs; the redaction rule covers personal data and real identifiers as well as secrets; added
where the loop may run; the human-in-the-loop script template is replaced by asking for one named
step; added the red-first restore procedure without `git stash`.

Inside the owner's agent loop, the repository's `LOOP.md` overrides this skill where they differ.

A discipline for hard bugs. Skip a phase only when you can say why.

Before exploring, read the repository's `AGENTS.md` and the docs for the area you are touching.

## Redact

This skill has you show commands, outputs and captured artifacts. Redact every secret first: write
`<REDACTED>` in its place. Build loops against environment variables so the credential stays in the
environment and out of what you show. Captured requests carry auth headers: quote only the lines that
carry the signal.

Personal data, credentials and real identifiers (names, hostnames, IP addresses, account IDs, email
addresses, serial numbers) follow the same rule. You may read them while diagnosing, but they never
enter a committed file, fixture, test, doc, issue, pull request or commit message. A regression test
built from a captured payload is rebuilt from a synthetic fixture of the same shape.

If the redacted output is not enough to diagnose the bug, say so and ask.

## Where the loop may run

- Work in your own clone or worktree. Never touch a deployed environment, device or account you
  were not given. If the bug only shows there, ask a maintainer for a redacted capture, naming the
  exact read-only request or query you need.
- Build the loop from the narrowest command that reaches the bug (one test, one package, one
  request), not from `just check`. A loop that needs the full gate every run is not tight.
- Run `just` with stdin from `/dev/null`, and bound every process you start with a timeout.

## Phase 1: Build a feedback loop

Everything else depends on this. With a fast pass/fail signal that goes red on this bug, bisection,
hypothesis testing and instrumentation all have something to consume. Without one, reading code will
not find the cause. Spend most of your effort here.

### Ways to construct one, roughly in this order

1. **A failing test** at whatever seam reaches the bug: unit, integration, end to end.
2. **An HTTP request** against a locally running server or a local Worker dev server.
3. **A CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **A headless browser script** that drives the UI and asserts on DOM, console and network.
5. **A replayed capture**: a sanitised request, payload or event log fed through the code path in
   isolation.
6. **A throwaway harness**: a minimal subset of the system with fakes at the external edges.
7. **A property or fuzz loop** when the bug is "sometimes wrong output".
8. **A bisection harness** when the bug appeared between two known states: automate "build at state
   X, check" and `git bisect run` it.
9. **A differential loop**: old version against new, or two configs, diffing outputs.
10. **Ask the person for one step** as a last resort, naming the exact action and the exact capture
    you need back.

### Tighten the loop

Make it faster (cache setup, narrow the scope), sharper (assert the specific symptom, not "did not
crash") and more deterministic (pin time, seed randomness, isolate the filesystem and database,
fake the network). A 30-second flaky loop is barely better than none; a 2-second deterministic one
finds the bug.

### Non-deterministic bugs

Aim for a higher reproduction rate. Loop the trigger 100 times, run in parallel, add load, narrow
timing windows. A 50% reproduction rate is debuggable; 1% is not.

### When you cannot build a loop

Stop and say so. List what you tried and ask for one of: access to an environment that reproduces
it, a redacted captured artifact, or permission to add temporary instrumentation. Do not hypothesise
without a loop.

### Done when

You can name one command you have already run (show it and its redacted output) that is:

- [ ] **Red-capable**: it drives the real bug path and asserts the reported symptom.
- [ ] **Deterministic**: the same verdict every run, or a pinned high reproduction rate.
- [ ] **Fast**: seconds, not minutes.
- [ ] **Unattended**: it runs without a person.

If you catch yourself building a theory from reading code before this command exists, stop.

## Phase 2: Reproduce and minimise

Run the loop and watch it go red. Confirm it shows the failure that was reported, not a nearby one,
and that it reproduces across runs. Capture the exact symptom (error, wrong output, timing).

Then shrink the repro to the smallest scenario that still goes red. Cut inputs, callers, config,
data and steps one at a time, re-running after each cut. Done when every remaining element is
load-bearing. The minimal repro becomes the regression test in Phase 5.

## Phase 3: Hypothesise

Write 3 to 5 ranked, falsifiable hypotheses before testing any. Format: "If X is the cause, then
changing Y will make the bug disappear, or changing Z will make it worse." A hypothesis without a
prediction is a guess: sharpen it or drop it. Show the ranked list to the person who asked when one
is present; they may rule some out at once. Do not block on an answer.

## Phase 4: Instrument

Each probe tests one prediction. Change one variable at a time. Prefer a debugger or REPL, then
targeted logs at the boundaries that separate hypotheses. Never log everything and search afterwards.

Tag every debug log with a unique prefix such as `[DEBUG-a4f2]` so cleanup is one `grep`.

**Performance regressions.** Logs are usually the wrong tool. Take a baseline first (a benchmark, a
profiler, a timing harness, a query plan), then bisect. Measure first, fix second. The
`audit-performance` skill covers the usual causes.

## Phase 5: Fix and regression test

Write the regression test before the fix, but only at a correct seam: one where the test exercises
the real bug pattern as it occurs at the call site. A seam that is too shallow (a unit test that
cannot reproduce the chain that triggered the bug) gives false confidence. If no correct seam exists,
that is a finding: report it in the pull request or to the person who asked.

With a correct seam: turn the minimal repro into a failing test, watch it fail for the right reason,
apply the fix, watch it pass, then re-run the Phase 1 loop against the original scenario. `write-tests`
covers what the test should assert.

To show the test fails without the fix: copy the changed production files aside with their modes
(`cp -p`, never the test). Restore tracked ones with
`git restore --source=<base> --worktree -- <production paths>`, and move any new untracked production
file out of the tree (restore cannot remove a file the base never had). Run (red), copy every file back
with `cp -p`, run (green), and confirm `git status` and `git diff --cached` match what they were before.
Do not use `git stash`; every worktree of the clone shares it.
Do not use `git checkout <base> -- <paths>`; it rewrites the index.

## Phase 6: Clean up

Required before declaring done:

- [ ] The original repro no longer reproduces (re-run the Phase 1 loop).
- [ ] The regression test passes, or the missing seam is reported.
- [ ] No `[DEBUG-` instrumentation remains (`grep -rn '\[DEBUG-'`).
- [ ] Throwaway probes and harnesses are deleted or sit outside the tree you commit.
- [ ] No secret, personal data or real identifier is in the diff, the test or the message.
- [ ] The hypothesis that proved correct is in the commit body and the pull request, so the next
      person to debug this area learns from it.

Then run `verification-before-completion` before saying it is fixed.
