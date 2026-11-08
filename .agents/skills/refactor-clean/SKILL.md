---
name: refactor-clean
description: Refactor cleanly instead of layering sediment on the code. Use for rename requests, stale or misleading names, legacy leftovers, a changed scope, duplicated concepts, local adapters, redundant guards or inputs, compatibility wrappers, an over-large module, or "just tack this on" pressure. Moves each concept to one clear owner and deletes the old shape in the same pass, while treating published names (package APIs, CLI flags, config keys, Home Assistant entity and unique ids, metric names) as contracts that need a migration.
license: MIT
---

# Clean refactoring

Source: https://github.com/dzhng/skills/blob/main/skills/engineering/refactor-clean/SKILL.md (MIT).

Changes from the source: dropped the game, renderer and specs-folder examples and the link to a skill not vended here; added the external-contract rule, the paths never to refactor by hand, and verification through the repository's `just` recipes.

Replace the old shape with the simpler shape the codebase would want if it were designed today. Refactoring is not adding a compatibility layer beside the problem. It moves ownership until every concept has one clear home: merging duplicated owners into one, and splitting one over-loaded module into the owners it was hiding.

## Do not refactor these by hand

- Generated files: change the source and regenerate with the recipe the repository's AGENTS.md names.
- Vendored or forked third-party code the repository's AGENTS.md marks as kept source-identical.
- Files a release tool owns (version files, `CHANGELOG.md`, release manifests).

## External contracts

A name someone outside the repository depends on is a contract, not an internal identifier: a published package's exported API, CLI flags and subcommands, config file keys and environment variables, Home Assistant entity ids and unique ids, metric and label names, HTTP routes and stored data formats. Renaming one silently breaks users: an entity id rename orphans dashboards and automations, a changed unique id creates a duplicate entity, a renamed metric breaks every alert and dashboard reading it.

Renaming a contract needs a migration, not a silent change: keep the old name working (an alias, a deprecated flag, a config migration, a Home Assistant entity registry migration, both metric names for a release) with a stated removal condition, and say so in the PR and the changelog-facing commit message. If you are not sure whether a name is a contract, treat it as one and ask in the PR.

## Workflow

1. **Sweep names** in every touched path. Does each name describe the concept's current scope? Rename misleading internal files, symbols and exports now, and update every consumer, test, doc and agent instruction in the same pass. Search again for stale references (`grep` or `rg` for text; the language server's find-references for symbols where available).
2. **Name the concept that lacks one owner**: duplicated across several owners, or several concepts fused into one module. Examples: a pricing rule, a state machine, a data contract, an API shape, a polling schedule, a UI state, a test oracle.
3. **Find every owner and consumer.** Treat wrappers, aliases, copied structs, migration comments and "temporary" branches as sediment until proven otherwise.
4. **Run a deletion pass before relaxing a check or making an input optional.** For each input, flag, guard, fallback and adapter in the path, ask what required behaviour breaks if it disappears. Trace its writers, readers and consumers. If removing it preserves the behaviour, delete the mechanism and its call-site, test and documentation residue.
5. **Promote what remains to its natural home**: the module that would own it from scratch. Make old call sites consume that owner directly and delete the stale path in the same pass.
6. **Keep compatibility only for a named consumer and a concrete behaviour** that removal would break, and give any bridge a removal condition. Hypothetical callers do not count; external contracts always do.
7. **Verify through consumers**, including failure and retry paths. Search again for the removed mechanism across code, tests, docs and agent instructions. Report each retained bridge and its removal condition.

## Rules

- **Every line is debt.** Before adding a guard, validator or cleanup path ask two things. Does the platform or framework already do this? Does the failure it guards change any outcome a consumer sees? If the only caller that could produce the bad state is someone editing the data by hand, delete the branch. The bar is "what breaks, for whom, if this line does not exist".
- **Measure the change.** Count production code apart from tests and docs (`git diff --numstat <base>` with test and docs paths excluded). A small behavioural change that costs many lines means the fix is fighting the existing shape: a special case where the general case belongs, a second owner beside the real one, a wrapper between two things that should be merged. Rework it; do not explain it. Name new surfaces (a column, queue, endpoint, dependency, config key) separately from the line count. Formatter churn in untouched files stays out.
- **Do not over-weigh the existing architecture.** "It already works" is not a reason to keep a shape. Pin behaviour with tests at the consumer surface and swap the architecture underneath, redrawing the seams if they are wrong.
- **One shared primitive beats N adapters.** An adapter is right only at an external boundary or as a short-lived migration seam.
- **Split a module that owns too many concepts.** Past about 1000 lines a file is a smell, not a verdict. Split along nameable responsibilities so dependencies move with them; a split that only relieves line count and scatters one concept is wrong.
- **Know what exists before building.** Search for an existing mechanism before writing a new one: reuse, consolidate near-duplicates, or extract a shared core. Two implementations that must agree will drift.
- **Name things for what they are, never where they came from.** `-v2`, `-new`, `-legacy`, a module named for an experiment, a "moved from X" comment: rename, and let git hold the history. External contracts are the exception and follow the migration rule above.
- **Prefer the idempotent contract over the refusal.** Installing what is already installed, deleting what is already absent, replaying a webhook: reach the end state and succeed. Refuse only when a different thing already holds the name.
- **Constrain the model to what production writes.** A schema or type that allows more than any writer produces taxes every consumer. Enforce the constraint at the write path.
- **Do not re-derive a value the owner computes.** A test or second consumer that recomputes it will disagree over a rounding or ordering detail. Export the owner's value and consume that.
- If the refactor widens into unrelated behaviour, slice it: land the shared contract first, then port consumers in reviewable passes, each its own `refactor:` commit.

## Verify

Run the focused tests for the touched code first, then `just check` once on the final tree, with a timeout; a slow tier the repository's AGENTS.md names may be left to pull request CI, and the PR says so. A refactor that changes no behaviour needs the existing tests to pass unchanged; a test you must edit to get green is a finding to explain. Use `verification-before-completion` before claiming it done.
