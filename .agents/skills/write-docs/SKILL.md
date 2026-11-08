---
name: write-docs
description: Write and edit project docs (README, docs/ markdown, docs-site pages) as a glossary of principles, not a mirror of the code, and write doc comments on exported symbols. Use when creating or revising a doc; when adding or changing an exported function, type or component; when a doc enumerates exact rosters, tables, flags or file lists the code already holds; when trimming narrative or changelog out of a doc; or when deduplicating overlapping docs and wiring them to the docs hub.
license: MIT
---

# Write Docs

Source: https://github.com/dzhng/skills/blob/main/skills/engineering/write-docs/SKILL.md (MIT).

Changes from the source: replaced the game-specific examples; added generated and release-owned files, the user-facing reference exception, code doc comments, and the writing and privacy rules for public repositories.

A doc is a **glossary**: it names the moving parts, says why each exists, and carries the
principles a reader cannot derive by grepping. The code is the source of truth for *what exists
right now*; the doc must never race it. Before writing any line, ask the one question that governs
this skill: **could the reader get this faster and more reliably by reading the code?** If yes,
point at the code instead of copying it in.

## Where docs live

- Find the hub first: the README, `docs/README.md` or `docs/index.md`, or a docs site's navigation
  config. Add a new doc under it and link it from the hub (and from the site navigation when the
  repository builds a docs site).
- Work is planned in issues, never in docs: do not add a `ROADMAP.md`, a checklist file or a second
  list of work. An issue links the doc; the doc never copies the issue.
- Some files are generated or owned by automation (a config reference, a `CHANGELOG.md` and version
  fields a release tool writes). Never hand-edit them: change the source and rerun the recipe the
  repository's AGENTS.md names.

## Keep versus shed

Keep, because a reader cannot grep their way to it:

- The WHY: why a thing exists, the principle behind a split, the taxonomy file names do not show.
- Non-obvious discoveries: platform quirks, "if you remove this, X breaks because Y", a contract
  two files silently share.
- Pointers to where things live, what KIND of thing lives there and the rule for what belongs.

Shed, because the code or its git history already holds it and a copy only rots:

- Exact rosters: entity lists, metric tables, helper lists, file lists, flag matrices.
- Narrative and changelog: "we renamed X", what was tried and abandoned.
- Exact counts, current constants, line numbers, and anything that merely restates the code.
- Issue numbers and internal labels as the only explanation of a rule. A rule stands on its own
  words; an id may follow as a pointer.

User-facing reference is the exception: a published list of config options, CLI flags, metrics or
entities is the product's contract for its users. Generate it from the source where the repository
can; otherwise keep it in one place and update it in the same PR as the code.

## Point, do not transcribe

Where you are tempted to list specifics, name the folder or the single file that owns them.
**Prefer a folder over a file, and a source-of-truth registry over a transcribed copy.** Describe a
helper module by the kind of helper it holds and the rule for what belongs in it, not its current
roster. One concrete touchstone grounds a principle; a full inventory is the smell.

## One home per fact

Every fact has exactly one canonical home; every other doc links to it. Repetition across docs is a
maintenance bug. A top-level or hub doc gets a short section plus pointers to the sub-docs. When two
docs explain the same thing, pick the hub and cut the other to a pointer.

## Code doc comments

A doc comment is documentation that lives next to the code, so the same question governs it:
**could the reader get this faster by reading the body?** If yes, it is noise.

- Exported symbols outside tests and generated code need one (Go exported identifiers, Python
  public functions and classes, exported TypeScript functions and components). Follow the
  language's convention: Go starts with the name (`Name does ...`), Python uses a docstring.
- Say what it is for and why it exists, not how the body works.
- Give the contract a caller cannot see in the signature: what it returns for the empty or missing
  case, which error it raises and when, units, ownership of a passed collection, whether it is safe
  for concurrent use, what it never does (no network, no write).
- Record the invariant or surprise behind a non-obvious choice: "if you remove this, X breaks
  because Y". Never restate the type, the parameter list or the name in other words.

## Link the tree, downward

Docs form a tree reachable from the hub: the hub links each sub-doc and a sub-doc links on to any
module-level doc beneath it. A doc links up or across **only to reuse a fact that lives there**.
Do not add a rote "part of X" back-link that carries no information.

## Writing rules

- No em dash, en dash or double hyphen in prose; use a comma, colon or a plain hyphen.
- No personal data, credentials or real identifiers in a doc, an example or an issue: no email
  addresses, handles, account ids, hostnames, device names, IP addresses outside the documentation
  ranges, or coordinates. Write the shape, not the instance (`user@example.com`, `192.0.2.10`).
  Run the repository's privacy sweep, if it has one (`python3 .github/privacy/sweep --staged`),
  before opening the PR.
- Link to code by repository path, not by line number.

## Edit pass

When trimming an existing doc, delete on sight: enumerations of code-discoverable items, changelog
and narrative, and any sentence that restates the code. Then read what survives as a stranger with
no conversation history: every remaining line should be a principle, a why or a pointer. If a line
would be just as true and useful as a link, make it the link. The gate is still `just check`; if
the repository builds a docs site, its build recipe must pass too.
