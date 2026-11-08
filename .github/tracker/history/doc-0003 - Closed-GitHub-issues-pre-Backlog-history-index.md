---
id: doc-0003
title: Closed GitHub issues (pre-Backlog history index)
type: other
created_date: '2026-08-14 16:18'
updated_date: '2026-08-14 16:19'
---
This repository tracked its work in GitHub Issues until **2026-08-14**, when it moved to the
in-repo Backlog.md tracker. This index is the readable history of that period from the checkout
alone.

**Backlog task IDs deliberately do NOT continue the `#NNN` numbering.** Importing closed issues as
`Done` tasks would have created a second ID space over the same history — backlog IDs follow
creation order, so no `PND-NNNN` could ever be made to match the `#NNN` already cited in commit
messages, `CHANGELOG.md` and code comments. The original numbers stay the only ID space for
anything that happened before the migration.

## Where the bodies are

Most of these issues **were deleted from GitHub** on 2026-08-14. For those, `gh issue view <N>`
returns nothing and the redacted archive is the record:

```bash
jq '.[] | select(.number == 469)' archive/issues-dump.json
```

The archive is redacted — see `archive/README.md` for the placeholder mapping and for why issue
#530's body is held out of git entirely. Four externally-reported issues were **not** deleted and
are still live on GitHub; they are marked *live* below.

## Closed issues

| # | Title | Closed | Resulting commit | Body |
| --- | --- | --- | --- | --- |
| #483 | Fix unauthorized live document comparison previews | 2026-07-26 | `3216100` | archive |
| #482 | Fix production workers missing core-only runtime dependencies | 2026-07-26 | `d3e2c05` | archive |
| #480 | Fix legacy job schema migration crash on startup | 2026-07-26 | `4ea2506` | archive |
| #478 | fix(ci): give load-sensitive tests realistic timeouts | 2026-07-25 | `5708d50` | archive |
| #477 | fix(ci): keep diagnostics version assertions release-safe | 2026-07-25 | `7d61bd2` | archive |
| #476 | Align Renovate cooldown with pnpm 11 package-age policy | 2026-07-25 | `434d014` | archive |
| #469 | Workflow-first application modernization | 2026-07-24 | `27af8de` | archive |
| #468 | Modernise Paperless 3.x integration, remove RAG, and add custom-field AI workflows | 2026-07-23 | `e291324` | archive |
| #397 | Docs site: redesign & rebrand alignment + SEO/LLM discoverability | 2026-07-03 | `586a62c` | archive |
| #269 | Client error: 406 Not Acceptable for every release after 0.6.2 | 2026-03-29 | `dfe438c` | *live* |
| #228 | Save view as standard / Filter gone after processing document. | 2026-03-20 | `f911a3e` | *live* |
| #4 | Dependency Dashboard | 2026-03-16 | — | archive |
| #33 | Installation dedupe on Synology not possible | 2026-02-14 | — | *live* |
| #103 | ModuleNotFoundError: No module named 'psycopg2' | 2026-02-13 | — | *live* |
| #25 | Action Required: Fix Renovate Configuration | 2025-09-26 | — | archive |

## Open at migration

| # | Title | Disposition |
| --- | --- | --- |
| #221 | Dependency Dashboard | Deleted; Renovate recreates its dependency dashboard on the next run. |
| #530 | Adopt the m7kni Design System across packages/web | Deleted; remaining work continues as **`PND-0001`**. Phases 1, 2, 3 and 5 were already complete (`399b015`, `15a7f60`, `d7a6584`, `56ab469`). |

## Counts at migration

17 issues total — 15 closed, 2 open. 13 deleted (10 owner-authored, 3 Renovate), 4 kept (external
reports on install and compatibility, which others may still reach by search). 39 comments,
verified complete against the REST API's own per-issue counts before capture.
