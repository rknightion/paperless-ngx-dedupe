---
name: audit-tests
description: Audit whether tests earn their maintenance cost and which suite owns each contract. Use when pruning redundant tests, investigating implementation coupling or test-only production hooks, reviewing the value of proposed coverage, deciding which test tier should own a contract, or auditing a whole package or subsystem. Use write-tests to implement the resulting test changes.
license: MIT
---

# Audit Tests

Source: https://github.com/dzhng/skills/blob/main/skills/engineering/audit-tests/SKILL.md (MIT).

Changes from the source: added who may delete a test (propose in the PR, a maintainer decides) and the never-weaken rule; replaced the source's review and delegation skills with a second reader and the repository's `just` gate.

Audit **independent proof**: what bug would escape if this test disappeared? The result is a map
of contracts to their surviving tests, with evidence for what to keep, repair, combine or remove.
Fewer tests is not the objective; less maintenance for the same or better confidence is.

The write-tests skill owns how to write and falsify a test. This skill owns whether that test adds
proof and where that proof belongs.

## Who may delete a test

- You **propose** a removal: the evidence record goes in the pull request description or the audit
  report, and a maintainer decides. Unless a maintainer asked you to remove a named test, the tree
  keeps it until that decision.
- Never weaken, skip, delete or special-case a test, fixture or baseline to get a pass. A test
  changes only when the intended behaviour changed; name it in the PR.

## Workflow

1. **Bound the audit.** Read the repository's AGENTS.md, then pick one production responsibility.
   Find its tests, fixtures, shared suites, build tags and how CI selects them. Record the base
   SHA, local changes and test results before editing. Separate existing failures from checks
   that could not run.
2. **Trace the claim.** Read each candidate in full, including table rows, beside the production
   entry point and the code it reaches. Inspect callers, sibling implementations, overlapping
   coverage and the history that explains why the test exists (`git log -S`, the issue or PR that
   added it). Write down what the assertions actually detect, even when the name promises
   something else.
3. **Record a disposition before editing**, in the evidence record below. Share findings as they
   become clear. An audit-only request ends with this evidence and a proposed batch, not with
   deletions.
4. **Choose the surviving owner.** Look across the records for whole redundant layers. Name the
   suite that owns each contract and every unique case it must absorb. Prefer the real path with
   controlled external dependencies over replaying internal collaborators. Another layer earns
   coverage only for a failure the owner cannot expose, such as routing or lifecycle behaviour.
5. **Change one coherent boundary.** Carry unique cases into the surviving suite with write-tests
   before removing their old home. Extend existing cases and fixtures instead of cloning setup.
   Remove newly unneeded test hooks in the same batch, after checking production consumers. Update
   test discovery and CI registration when moving a suite.
6. **Prove preservation.** Compare removed assertions with survivors, looking for lost contracts
   and assertions that cannot fail for the intended reason. Falsify transferred regression
   coverage (break the code, watch the test fail for the right reason, restore the original bytes
   without disturbing other work). Report baseline failures separately. Run the owner and sibling
   suites, then `just check` once on the final tree, with a timeout; a slow tier the repository's
   AGENTS.md names may be left to pull request CI, and the PR says so.
7. **Close the batch.** Have a second reader (another agent or a maintainer) compare removed
   coverage with its new owners, then reconcile the evidence record with what shipped. Report
   unresolved failures and unrun checks explicitly. A smaller green suite does not prove the
   removed coverage was redundant; the contract map and preservation evidence do.

## Evidence record

For each candidate: location and name, the actual detectable failure, why it exists, production
consumers of any supporting hook, and a decision.

- **Keep**: name the independently protected contract. A file move alone does not change this.
- **Repair**: preserve the contract but replace a weak, misleading or wrongly placed assertion.
- **Combine**: name the destination suite and the unique cases it must prove first.
- **Remove**: name the stronger surviving proof, or show there is no contract to protect.
  Suspicion of duplication is insufficient.

Add the source and history evidence, cleanup unlocked, risk and validation command. Missing
evidence stays an open question, not a deletion.

## False confidence

Use these as investigation prompts, not automatic removal rules:

- **Circular evidence.** Expected output comes from the helper under test, or a fixture copies an
  inventory from production, or a value is compared with itself.
- **An exercise without a claim.** Executing lines raises coverage without detecting a credible
  defect.
- **The harness does the job.** A mock implements the promised behaviour, a fixture supplies the
  ordering production must generate, or a persistence assertion reads a store the real path never
  writes. One identical fake for two different APIs can hide their differences.
- **The wrong cause goes red.** A negative case hits a different guard. Verify the failing
  condition, not merely that something rejected the input. Check every parameter row reaches its
  claim.
- **Declarations posing as behaviour.** Source greps, import lists and capability flags certify the
  declaration while the user path is broken.
- **One proof repeated.** Private helper tests, per-provider replays of shared logic and several
  layers exercising one regression. Keep distinct transport and lifecycle risks, not copies.
- **Tests keeping code alive.** A helper or escape hatch exists only because tests call it. Move
  the proof to the real entry point and remove the mechanism.

## What earns retention

Behaviour includes compatibility and operational contracts: API and package shape, CLI flags,
config keys, wire bytes, defaults, migrations, storage, security, Home Assistant entity and unique
ids, metric names, chart values, package contents and release rules. A static assertion can be
their cheapest independent proof. Ask whether the test survives an internal rename while detecting
a broken external promise. Neither slowness nor resemblance to implementation is sufficient
evidence for deletion. Never remove a valid claim to make an audit green: an existing failure may
be a product defect, so reproduce it and report it separately (an issue, or the PR description)
rather than fixing it in this batch.

## Whole-package sweeps

- Inventory every owned test, including cases in shared suites and integration harnesses, and
  assign each to one production responsibility. Record baseline outcomes and test and support
  size.
- Give every declaration a disposition and evidence; a table can share one record only if every
  row deserves the same decision. Then take a second pass across records to choose surviving
  suites and retired layers.
- Keep edits to shared fixtures under one owner. Each batch introduces no unexplained failures.
- If the base advances, inspect new cases in any file being removed and carry their contracts
  forward.

## Done

Hand off the contract map, decisions and reasons, production simplifications, valuable tests
deliberately retained, preservation gaps and their resolution, and the verification actually run
with exit codes. Size describes the outcome; it never sets the deletion target. Claim a complete
audit only when the inventory has no unexamined entries.
