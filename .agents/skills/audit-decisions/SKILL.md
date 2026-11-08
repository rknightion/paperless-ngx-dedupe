---
name: audit-decisions
description: Audit the decisions an implementing agent made, not its diff. A pure audit that traces the work into a decisions ledger, changes no code and never blocks an unsupervised run. Working code still embeds architecture nobody chose; surface it because future work inherits it. Use when asked to review the decisions an AI made on the owner's behalf, before landing AI-implemented work, when integrating work another agent did, or when a fix works but might be a point fix.
license: MIT
---

# Audit Decisions

Source: https://github.com/dzhng/skills/blob/main/skills/engineering/audit-decisions/SKILL.md (MIT).

Changes from the source: the ledger lives in the pull request description instead of a `specs/` file; the plain-language register of the source's separate eli5 skill is inlined; added the line between small in-scope calls and owner calls, the external-contract categories, and the privacy rule for a public ledger.

Given a good decision, an agent implements it faithfully; wherever the task is underspecified, it
makes the decision itself, silently, and the diff will not flag it. Reviewing thousands of changed
lines does not scale, and it inspects the execution, which was probably fine. The audit that scales
is of the **decisions**: surface every one the implementer made on its own, judge that list and
record the verdicts.

This is about architecture more than bugs. An implementation can work perfectly and still rest on
decisions nobody made: a data shape, a storage location, a dependency, an API contract, a tradeoff
of memory for speed. Each is load-bearing for future work, and the owner needs to know them not
because they are wrong but because they now own them.

This is purely an audit. It changes no code. Trace back through every step the work took, and every
step each contributing agent took (reconstruct from its report, its diff, its commits and its
evidence), and surface every decision made on the owner's behalf that was not in the issue, the
task description or the repository's documented decisions. The ledger replaces reading the code as
the review surface. Acting on the verdicts belongs to the caller.

Two ways in, same audit:

- **Called by an agent or automation that coordinates implementers** (per pass or per batch):
  audit that pass, append its entries to the ledger and return.
- **Called directly by a person**: audit the whole body of work in front of you (a branch, a set of
  landed changes, a named change) and present the report at once. Recommend; change nothing.

Inside the owner's agent loop, the repository's `LOOP.md` overrides this skill where they differ.

## Where the ledger lives

- **The pull request that lands the work.** Put the ledger in the PR description under a
  "Decisions" heading. If you cannot write to the PR yourself, hand the ledger back as text so
  whoever opens it can place it there. Do not create a `decisions.md`, a `specs/` directory or a
  checklist file.
- A `needs-user` entry the owner decides becomes a decision record wherever the repository's
  AGENTS.md says decisions live; other docs cite that record rather than restating it.
- The ledger is public in a public repository. No personal data, credentials or real identifiers
  in it: write the shape, not the instance. Run the repository's privacy sweep over it, if it has
  one.

## Workflow

1. **Elicit and trace back.** Ask the implementer: "Which decisions did you make that you are not
   confident of? List all." Treat the answer as a starting point; agents under-report. Trace the
   history yourself and collect every decision in the work that is not in the task. Sweep the
   categories, not only the suspect fixes: data shapes and formats, storage and naming, schema and
   migration shape, API contracts and their error behaviour, external names users depend on (CLI
   flags, config keys, Home Assistant entity and unique ids, metric names), dependencies added,
   concurrency and performance tradeoffs, defaults and poll intervals, scope interpretations, and
   patterns future code will imitate. Decisions the task explicitly delegated are discretion, not
   audit items.
2. **Triage each decision on evidence.** Forced by the task, or invented? Invented ones get the
   scrutiny: is this the general solution, or a fix shaped to the one failing case? Verdict per
   decision: **sound**, **unsound** or **needs-user**, with a **confidence** that the owner would
   have made the same call. Small design and wording calls inside the agreed scope are the
   implementer's to make: judge them sound or unsound. Reserve needs-user for taste, product
   direction, external cost, a change to a published contract, and anything outward-facing or
   irreversible. Every needs-user entry carries a reversible provisional call, so an unattended
   run proceeds without waiting. The audit never stalls a run.
3. **State the corrected decision, do not sketch a patch.** For an unsound decision, name the
   property that must hold in general, not an edit layered on top. A patch on a bad decision
   preserves the decision.
4. **Bank every decision in the ledger** and promote load-bearing sound ones into the PR or issue
   so later work inherits them as givens.
5. **Present the ledger grouped by verdict, ranked by confidence**, least confident first inside
   each group. When it is long, open with the two or three least-confident decisions overall.
   needs-user means decide, unsound means redo, sound means acknowledge: sound is not skippable.
   Only trivial discretion (internal naming, cosmetic calls) compresses to a one-line count.

## Write every entry in plain language

The reader did not live the session: they have read none of the code, the diff or the messages.
Write each entry so it stands alone:

- Walk one concrete scenario end to end: the triggering event, what the work does today, what the
  unbuilt alternative would do. Do not describe properties in the abstract.
- Define every term of art at first use, and never lean on a label the work invented.
- Use pseudocode at the level of the decision when it is about control flow, ordering or timing.
  The tell that you needed it: the prose says "only when", "before", "unless" or "as soon as" and
  the reader still cannot say what happens on the second call.
- "A gated request is dropped, not deferred" is a headline, not an entry. If the reader must ask
  "explain this one", the entry failed.

## Ledger entry format

- **When**: the commit or pass it landed in.
- **The decision**: a one-line headline, then the walked scenario.
- **The gap**: what the task left unspecified that forced it.
- **The reach**: what future work it constrains or enables.
- **Verdict**: sound, unsound or needs-user, with a one-line why. Unsound names the corrected
  decision to redo from. Needs-user names the provisional call and how to reverse it.
- **Confidence**: low, medium or high, that the owner would have made the same call.

Rules of the ledger:

- Banked is settled: a decision already in the ledger or promoted into the PR or issue is a given,
  never re-listed or re-decided.
- Entries clustering around one area mean the plan is foggy there: send that part back to the
  issue for a clearer scope rather than triaging the same class of decision forever.
- **The scenario survives every rewrite.** When entries are consolidated or copied, each keeps its
  walked scenario and defines any invented label where it is used. A consolidation that shrinks
  entries to headlines has failed even if every fact survives.

## Rules

- **"It works" is not a verdict on the decision.** The recurring smell is the coincidental fix: a
  resized buffer, bumped timeout or special case whose magnitude happens to cover the failing
  input. Ask what property *guarantees* the fix in general; if the answer is "this case passes",
  the decision is unsound even though the tests are green.
- Declared success is the point of maximum risk. Never skip the audit because the result looks
  clean. An empty list on nontrivial work is a red flag: what did the task leave unspecified?
- The audit changes no code, tests or build state, so the ledger and the tree agree on what the
  caller is deciding about. Evidence-gathering is fair game (read anything, run the existing
  tests, write transient probes), and every probe is removed before you finish.

## Done

Every invented decision has a ledger entry with a verdict; every unsound entry names the corrected
decision; every needs-user entry carries a reversible provisional call; the ledger is presented
grouped by verdict, least confident first, and each entry reads without follow-up questions, with
the tree untouched. A report that shows the diff instead of the decisions, or a fix applied during
the audit, is not done.
