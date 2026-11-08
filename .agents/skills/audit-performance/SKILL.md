---
name: audit-performance
description: Audit and prioritize performance work through bounded-work and forward-progress checks. Use when asked to find performance issues, investigate freezes, errors, OOMs or slow screens, review polling, retries, backoff or rate limits for no-progress loops, check fan-out or queue growth, rank performance findings, or implement the next simple performance fix.
license: MIT
---

# Audit Performance

Source: https://github.com/dzhng/skills/blob/main/skills/engineering/audit-performance/SKILL.md (MIT).

Changes from the source: added the hot paths typical of polling exporters and Home Assistant integrations, the code versus live evidence split, the metric-label rule, and the PR description in place of a performance ledger file.

Find work that grows without a useful bound or repeats without progress. Produce an
evidence-backed report, then prefer the smallest fix that preserves recovery.

## Hot paths to trace first

Many of these repositories are polling exporters, Home Assistant integrations and small services
that call third-party APIs. Their hot paths are their own:

- **Polls.** Each poll's interval, how many upstream requests one cycle makes, and how that count
  grows with devices, accounts, entities or pages. A poll that refetches everything when one item
  changed, or overlaps the previous cycle when it runs long, is the first suspect. In a Home
  Assistant integration, check that one coordinator fetches for all entities rather than each
  entity polling on its own, and that blocking I/O stays off the event loop.
- **Retries and backoff.** What changes before the next attempt? A fixed-interval retry against a
  failing upstream, retries stacked at several layers, or a retry that ignores `Retry-After`
  multiplies load exactly when the upstream is struggling. Backoff needs a cap and jitter.
- **Rate limits.** The upstream's documented limit against the worst-case request count per
  window, including retries and every configured account or device. A 429 is a signal to slow
  down, not an error to retry at once.
- **Queues and fan-out.** In-memory or durable queues, worker pools and per-item goroutines, tasks
  or promises. Is each bounded, and what happens on overflow? A permanent failure at a queue head
  blocks everything behind it.
- **Request-time reads.** Scrape handlers, API endpoints and Worker requests that do upstream calls
  or unbounded reads per request, instead of serving the last poll's result.
- **Cardinality.** Metric label values or entity counts that grow with input (ids, error text,
  free-form names) cost memory in the process and in every consumer.

## Workflow

1. **Trace hot paths.** Find recurring syncs, polls, streams, retries, queues, scheduled jobs and
   request-time reads. Follow each through its production caller; ignore test-only paths.
2. **Compute the amplification.** State the trigger and worst-case work in concrete units: rows,
   queries, pages, entries, bytes, jobs, retries or upstream requests. Distinguish a bounded large
   constant from work that grows with history, devices, accounts or outage duration.
3. **Check forward progress.** For every retry, fixed-prefix batch, cutoff or transitional poll,
   identify what changes before the next attempt. If nothing must change, it can loop or starve.
   Partial fixes must not merely delay the same work.
4. **Falsify severity.** Inspect existing caps, indexes, backoff, deadlines, healing owners and
   caller frequency. Dismiss findings already bounded cheaply enough or continuously healing.
5. **Record the findings** in the PR description, or the audit report you hand back. Report each
   out-of-scope finding for a maintainer to file as an issue. Do not add a ledger file, a
   `ROADMAP.md` or a checklist file. Include priority, trigger, impact, current owner, acceptance
   seam and evidence.
6. **Prioritize with the policy below.** If implementation is authorized, use the write-tests
   skill and prove the old behaviour red at the outermost practical seam, then fix and update the
   report with verification evidence. Run `just check` once on the final tree, with a timeout; a
   slow tier the repository's AGENTS.md names may be left to pull request CI, and the PR says so.

## Evidence

- **Code evidence**: a red-first test or benchmark asserting the bound (the request count per poll,
  the page count, the queue depth, the peak memory) beside the exact result.
- **Live evidence**: a timing or profile from a real run. Never read live systems or accounts you
  were not given; state in the PR which measurement a maintainer should capture and that live
  evidence is pending. A live figure has a before and an after, and an after-only figure says so.
- Check that a measured workload does what it claims before trusting its numbers: that the route
  is travelled and the failure arm runs. Measure the failure arm too, and isolate a cost
  measurement from everything else running in the process.

## Priority Policy

Rank highest when the issue can cause a user-visible freeze or error, memory or disk growth,
blocked request processing, data loss, an upstream ban or lockout from exceeding a rate limit,
amplification across every configured device or account, or a poison item that prevents later
work.

Prefer low-risk fixes that bound existing work: stream pagewise, honor backpressure and
`Retry-After`, coalesce schedules, move poison items aside, skip proven no-ops, or make one
exhaustive search end in a terminal verdict. A safety cap is a pathology guard, not a normal
product limit: set it above legitimate large workloads, emit actionable telemetry when reached and
define what happens next.

Do not prioritize by scary-looking counts alone:

- Polling may continue forever when the polled state has a real recovery owner and can eventually
  change. Fix states that can never heal, not timers that are merely long-lived.
- Cheap bounded work is acceptable without production evidence. Do not build a cache, cursor state
  machine or alternate read model to reduce a modest fixed request count.
- Do not optimize information away when it may soon support product UI or behaviour.

## Guardrails

- Preserve healing. A cache or no-op shortcut keeps cheap recovery signals and falls back to
  ordinary reconciliation on drift, uncertainty, restart or prior failure.
- A recovery scan must either finish or persist forward progress. For a legitimately huge
  namespace, persist a cursor and resume after it. Never restart the same partial prefix forever.
- Separate retryable failures from terminal ones. A permanent rejection must not sit at a queue
  head or fixed prefix forever.
- Bound both sides of a transport and every durable or in-memory queue. State the overflow
  behaviour; never silently drop accepted durable data.
- Judge a cache, index or delta protocol by its worst edit, not its quiet average. Assert the
  bounded work alongside the exact result.
- Every limit introduced or changed has an observable log or metric naming the limit kind, the
  configured bound, the affected owner and the overload outcome. Metric labels stay a bounded set:
  identifiers, payload content, error text and credentials never become labels.
- A changed poll interval, default or metric name is a user-facing change: say so in the PR.

## Done

The audit is complete only when every finding has a production trigger, quantified amplification,
priority rationale, acceptance seam and recorded disposition, and every dismissed candidate says
which bound or healing mechanism makes it acceptable. An implementation is complete only when its
red and green proof shows bounded work **and** continued recovery.
