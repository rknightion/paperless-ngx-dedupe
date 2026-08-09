---
title: FAQ
description: Frequently asked questions about deduplication, AI metadata, deployment, and safety in Paperless NGX Dedupe.
---

# Frequently Asked Questions

Short answers to common questions. Each answer links to the authoritative page for the full
detail — treat those linked pages as the source of truth.

## Getting Started

### What do I need before I start?

Docker Engine with Compose v2, a running Paperless-NGX instance, and a Paperless-NGX API token
(recommended) or username/password. See [Installation](installation.md).

### Is this safe to run against my production Paperless-NGX library?

Paperless NGX Dedupe is in early development and is **not production-ready** — features are
incomplete, APIs will change, and data loss may occur. Do not run it against a library you care
about without a backup. See the warning in [Getting Started](getting-started.md).

## Duplicate Detection

### How does it decide two documents are duplicates?

Documents are shingled into word n-grams, compressed into MinHash signatures, and grouped into
candidate pairs with Locality-Sensitive Hashing. Candidates are then scored with a weighted
combination of Jaccard and fuzzy text similarity, reduced by a discriminative penalty for
pairs that share a template but differ in dates, amounts, or reference numbers. See
[How It Works](how-it-works.md).

### How do I tune what counts as a duplicate?

Adjust `similarityThreshold`, the confidence weights, and `discriminativePenaltyStrength` in
**Settings** or via `PUT /api/v1/config/dedup`. The [Tuning Guide](how-it-works.md#tuning-guide)
covers false positives, missed duplicates, and slow analysis with concrete parameter values.

### Will syncing or analyzing change anything in Paperless-NGX?

No. Sync only reads documents and their text from Paperless-NGX; analysis only reads locally
stored content and writes duplicate groups to the app's own database. Nothing in Paperless-NGX
is modified until you explicitly act on a duplicate group or an AI suggestion. See
[Architecture](architecture.md#review-flow).

### Does it ever delete documents from Paperless-NGX?

Only when you explicitly run the batch delete operation on duplicate groups you have reviewed,
and only for groups currently in `pending` status with `confirm: true` in the request. This is
called out as a destructive action in [Getting Started](getting-started.md#6-batch-operations).

## AI Metadata

### What does the AI feature send, and where?

When `AI_ENABLED=true`, each document's text (truncated to `maxContentLength`, 8,000 characters
by default) is sent to OpenAI along with the prompt template to generate metadata suggestions.
AI processing is off by default and requires an explicit API key. See
[AI Processing](ai-processing.md).

### Can AI suggestions change my documents automatically?

No. Every AI result is stored as `pending_review`. Scheduled AI processing creates suggestions
for review only — it never applies them. A suggestion is only written to Paperless-NGX when an
operator explicitly applies it, individually or in bulk. See
[AI Processing — Reviewing Results](ai-processing.md#reviewing-results).

### Can applying AI suggestions create new correspondents, document types, or tags?

Yes, by default. If a suggested value does not already exist in Paperless-NGX, it is created
automatically unless `createMissingEntities: false` is passed. Preflight
(`POST /api/v1/ai/results/preflight`) previews exactly what would be created before you apply.
See [AI Processing — Applying Suggestions](ai-processing.md#applying-suggestions).

## Performance

### How long does analysis take on a large library?

MinHash signature generation is O(n) and LSH candidate detection is sub-quadratic; the most
expensive step is detailed scoring of candidate pairs. The first sync is the slowest step since
it fetches every document; later syncs are incremental. For large libraries (10,000+ documents),
lowering `numPermutations` or `fuzzySampleSize`, or raising `similarityThreshold`, reduces
analysis time. See [Troubleshooting — Performance Tuning](troubleshooting.md#performance-tuning).

## Data and Backups

### Where is my data stored?

In a single SQLite file (`DATABASE_URL`, default `./data/paperless-ngx-dedupe.db`) containing
synced document metadata and text, MinHash signatures, duplicate groups, jobs, and AI review
state. It is separate from the Paperless-NGX database. See
[Configuration](configuration.md#core-runtime).

### How do I back it up?

Download a consistent snapshot from **Settings > Database backup**, taken with SQLite's online
backup API so sync and analysis do not need to stop. Restoring is offline-only and does not
affect Paperless-NGX documents. See
[Database Backup and Restore](database-backup-and-restore.md).

## Deployment

### Does it need Redis or Postgres?

No. It uses an embedded SQLite database and Node.js `worker_threads` for background jobs
instead of a separate queue. Docker Compose with the bundled `compose.yml` is the supported
deployment path. See [Architecture — Key Technical Choices](architecture.md#key-technical-choices).

### Can I point it at a Paperless-NGX instance running in the same Docker Compose stack?

Yes, but do not use `localhost` for `PAPERLESS_URL` unless both services share a container. Use
the Paperless-NGX container's service name on a shared Docker network, e.g.
`http://paperless-ngx:8000`. See [Installation — Important URL Note](installation.md#important-url-note).
