---
id: doc-0001
title: Agent fan-out protocol (canonical)
type: specification
created_date: '2026-08-14 16:17'
updated_date: '2026-10-03 22:19'
---
> **Generated pointer, not authoritative.** Rendered from `sources/loop-pointer.md` in `m7kni/agent-docs` at
> commit `5eed25f` for `paperless-ngx-dedupe`. It replaces this board's former full copy of the fan-out
> protocol. Do not edit it here; read the files it names.
# Loop protocol pointer

This board no longer carries the loop protocol. Its canonical files live in the agent-docs checkout
at `~/repos/agent-docs/sources/loop/`:

- `contract.md` - what every loop root obeys at run time, on any harness.
- `harness-pi.md`, `harness-claude.md`, `harness-codex.md` - one per harness.
- `planner.md` - preparing a loop; the loop skill reads it.

In a loop, running agents read only their goal, the contract and their harness file. Lanes read only
their brief. Repository facts for loops live in this repository's `LOOP.md`. Ignore any older full
copy of the fan-out protocol: it is stale.
