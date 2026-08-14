---
id: doc-0002
title: Wave operating model
type: guide
created_date: '2026-08-14 16:17'
updated_date: '2026-08-14 16:18'
---
This document carries **only** what is specific to this repository. The campaign model itself —
run modes, the routing contract, authority and the thread pool, child lane briefs, external
contract freezing, the goal-file template, the pre-flight checklist — is in the **Agent fan-out
protocol (canonical)** doc. If a section here could be pasted into another project unchanged, it
is in the wrong document.

## Rules this project added

Each of these exists because of a specific failure, recorded so the rule is not re-litigated as
overhead.

**A schema change is two edits, and the second one is the one that gets forgotten.** Editing the
Drizzle table definition in `packages/core/src/schema/sqlite/` is *not* enough. The auto-migration
system stores a schema hash after "applying" DDL, but it emits `CREATE TABLE IF NOT EXISTS`, which
skips tables that already exist — so a new column on an existing table is never added, and the
hash records success. Every schema change also needs a **pre-DDL migration function** in
`packages/core/src/db/migrate.ts` using `ALTER TABLE ADD COLUMN` behind a `tableHasColumn` guard,
called from `migrateDatabase()`. There are **12** of these already (`migrateArchiveColumns`,
`migrateDiscriminativeScore`, `migrateJobExecutionToken`, …) — copy the nearest one.

*The failure:* a legacy job-schema migration crashed the app on startup for existing installs.
This is the single most expensive defect class in the repo because it is invisible on a fresh
database — the only environment most lanes test in — and only fires for users with existing data.
**A lane changing the schema must state which pre-DDL migration it added, and must test against a
database created before its change.**

**A lane may not declare a UI change done on the strength of the class names it wrote.** Contrast
is measured against the surface the text actually sits on, in a browser, in both colour schemes —
not against white and not by reading the token. Two defects reached `main` that only measurement
caught: tooltips styled `bg-ink text-white` rendered white-on-white once `--color-ink` inverted in
the dark scope, and white on a solid accent fill measured **~2.3:1** in dark because the dark scope
brightens the accent so it survives as a link. The fix for the second was a dedicated
`--color-on-accent` token (`app.css:65` light, `:184` dark), now used by every filled control.

**Core stays framework-agnostic, and "it builds" does not prove it.** `packages/core` must not
import a web framework. A production image once shipped without core-only runtime dependencies
because the dev tree resolved them and the built image did not. Changes touching core's
dependencies or `packages/core/src/jobs/worker-paths.ts` are verified with `pnpm docker:validate`,
not with `pnpm build`.

## Recurring defects in this codebase

- **Tailwind v4 `@theme static` is load-bearing** (`packages/web/src/app.css:35`). Tailwind emits
  only the theme variables it can see used by a utility, and many tokens here are reached solely
  through raw `var()` — from the `.dark` block, from inline styles, from the ECharts theme. Drop
  `static` and they vanish silently and dark mode half-fails. `@theme inline` would be actively
  wrong: it resolves tokens to literals inside utilities, baking the light palette into every
  class and defeating `.dark` entirely. Do not "tidy" this keyword.
- **The confidence trio must move in step.** `ui/ConfidenceBadge.svelte`,
  `duplicates/ConfidenceBreakdown.svelte` and `duplicates/ConfidenceTooltipContent.svelte` band the
  same score three ways. They were reduced from four bands to three; changing the thresholds in one
  and not the others is a silent inconsistency no test catches.
- **`lucide-svelte` still ships legacy class components** (pinned `^1.0.0`), so Svelte 5's
  `Component` type rejects them. Type icon props as `typeof SomeIcon`, not `Component`.
- **`/api/v1/*` and the page loader must call the same core query.** A `.server.ts` load function
  that re-implements the query drifts from its API route. This has produced pages disagreeing with
  the API they are supposed to mirror.
- **CI is load-sensitive.** Timing-dependent tests that pass locally have failed under CI
  contention. Give them realistic timeouts rather than tightening them to the local machine.

## Lane conventions and exclusive resources

**The E2E suite is exclusive and cannot be parallelised across lanes.** `pnpm test:e2e` binds
**port 4173** and destroys and recreates a single database at `packages/web/data/e2e-test.db` via
`e2e/prestart-cleanup.ts`. Two lanes running it concurrently do not merely queue — the second wipes
the first's database mid-run and both report nonsense. **One lane holds E2E at a time**, or it runs
once in the wiring pass.

`pnpm docker:validate` is likewise exclusive: it binds host ports through `compose.dev.yml`.

Unit tests (`pnpm test`) and type-checking (`pnpm check`) are safe to run concurrently.

**Natural lane boundaries**, in decreasing order of how cleanly they separate:

| Lane | Owns | Notes |
| --- | --- | --- |
| core-engine | `packages/core/src/{dedup,sync,paperless}` | No web imports. Cleanest boundary in the repo. |
| core-schema | `packages/core/src/schema/`, `src/db/migrate.ts` | **Single lane only** — `migrate.ts` is append-ordered and two lanes appending to it conflict every time. |
| web-api | `packages/web/src/routes/api/v1/` | Must not diverge from the page loaders. |
| web-ui | `packages/web/src/lib/components/`, `src/routes/` (non-API) | Split by feature area, never by file type. |

## Ownership, and the escape hatch

One file has exactly one owner per wave. The files that are edited by the **wiring pass only**,
never by a parallel lane: `packages/core/src/index.ts` (the barrel), `packages/core/src/config.ts`,
`packages/core/src/db/migrate.ts`, `packages/web/src/lib/components/ui/index.ts`, and
`packages/web/src/app.css`.

**The escape hatch:** a lane that needs a change inside another lane's boundary does **not** edit
it and does **not** stop. It writes the exact change it needs — file, symbol, signature — into its
own task with `--append-notes`, then continues with the rest of its brief. The wiring pass applies
it. A lane blocked with nothing to do reports and exits; it never widens its own boundary to make
progress. A boundary with no escape hatch is a stop condition wearing a safety label.

If the brief does not cover a decision, **stop and return the question**. Do not invent an answer.
One round-trip is cheaper than the rewrite.

## Run-end against this tracker

Task state is the record. Nothing durable may live only in the terminal.

- Landed work: `Done`, with the commit SHA in the final summary, finalized **in one call** —
  `backlog task edit pnd-000N --check-ac 1 --check-ac 2 -s Done`.
- Attempted and blocked: `Parked`, with a concrete resume boundary — what was tried, what the next
  action is, and what would unblock it. "Blocked" without a resume boundary is the most valuable
  thing a long run produces being thrown away.
- Untouched work needs no action; it is self-evidently still `To Do`.
- Discovered work: a new task labelled `needs-triage`. Never fold it silently into the task in hand.

The gate before any task reaches `Done` is `definition_of_done` in `backlog/config.yml`, which
carries this repo's real commands. `pnpm test:e2e` is in it conditionally — run it when
`packages/web` behaviour changed, and remember it is exclusive.

The closing message to the terminal is a covering note: **what did this run learn that no single
task captures.** It is a terminal action, not a reply to a request — nobody asks for it, and
writing it is the last unit of work.
