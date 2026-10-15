---
id: doc-0001
title: Loop protocol pointer
type: specification
created_date: '2026-08-14 16:17'
updated_date: '2026-10-15 18:15'
---
> **Generated pointer, not authoritative.** Rendered from `sources/loop-pointer.md` in `m7kni/agent-docs` at
> commit `4c27edf` for `paperless-ngx-dedupe`. Do not edit it here; read the files it names.
# Loop protocol pointer

This board no longer carries the loop protocol. Its canonical files live in the agent-docs checkout
at `~/repos/agent-docs/sources/loop/`:

- `contract.md` - what every loop root obeys at run time, on any harness.
- `harness-claude.md`, `harness-claude-openai.md`, `harness-codex.md`, `harness-pi.md` - one per
  harness.
- `charter.md`, `lane.md` - templates for a run's charter and its lane rules.
- `planner.md` - preparing a run; the loop skill reads it.

In a loop the root reads its charter, the contract and its harness file. Lanes read only their brief
and the run's `LANE.md`. Repository facts for loops live in this repository's `LOOP.md`.
