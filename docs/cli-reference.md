---
title: CLI Reference
description: Command-line interface for Paperless-Dedupe — sync, analysis, configuration, and data export
---

# CLI Reference

The `@paperless-dedupe/cli` package provides a command-line interface for running sync, analysis, configuration, and export operations without the web server.

## Installation

The CLI is part of the monorepo and requires building from source:

```bash
# Build all packages
pnpm build

# Run the CLI
node packages/cli/dist/bin.js --help

# Or during development
pnpm --filter @paperless-dedupe/cli dev -- --help
```

The binary is named `paperless-dedupe` and is defined in `packages/cli/package.json`.

## Global Options

These options are available on all commands:

| Option | Default | Description |
|--------|---------|-------------|
| `--db <path>` | `DATABASE_URL` env var | Override the database file path |
| `--env-file <path>` | `.env` | Path to .env file |
| `--log-level <level>` | `LOG_LEVEL` env var | Override log level: `debug`, `info`, `warn`, `error` |
| `--json` | `false` | Output results as JSON to stdout |

## Commands

### `sync`

Sync documents from your Paperless-NGX instance.

```bash
paperless-dedupe sync [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--full` | `false` | Force full sync instead of incremental |

**Examples:**

```bash
# Incremental sync (only changed documents)
paperless-dedupe sync

# Full sync (re-fetch everything)
paperless-dedupe sync --full

# JSON output for scripting
paperless-dedupe sync --json
```

**Output:**

The command displays sync duration, total documents fetched, and counts for inserted, updated, skipped, and failed documents. Any errors are listed at the end.

---

### `analyze`

Run the deduplication analysis pipeline.

```bash
paperless-dedupe analyze [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--force` | `false` | Force re-analysis of all documents |

**Examples:**

```bash
# Incremental analysis (only new/changed documents)
paperless-dedupe analyze

# Force full re-analysis
paperless-dedupe analyze --force
```

**Output:**

Displays analysis duration, documents analyzed, signatures generated/reused, candidate pairs found/scored, and groups created/updated/removed.

---

### `status`

Show dashboard and duplicate statistics.

```bash
paperless-dedupe status
```

**Examples:**

```bash
# Human-readable dashboard
paperless-dedupe status

# JSON for scripting
paperless-dedupe status --json
```

**Output:**

Displays two sections:

1. **Dashboard** -- total documents, pending groups, storage savings, last sync/analysis timestamps, top correspondents
2. **Duplicate Statistics** -- total/pending/false positive/ignored/deleted groups, confidence distribution, top correspondents

!!! tip "Database-Only Command"
    The `status` command only reads from the local SQLite database. It does not require a connection to Paperless-NGX.

---

### `config show`

Display the current deduplication configuration.

```bash
paperless-dedupe config show
```

**Output:**

Lists all dedup configuration parameters with their current values.

---

### `config set`

Update deduplication configuration parameters.

```bash
paperless-dedupe config set [options]
```

**Options:**

| Option | Type | Range | Description |
|--------|------|-------|-------------|
| `--similarity-threshold <n>` | float | 0.0 -- 1.0 | Minimum similarity score for duplicate pairs |
| `--num-permutations <n>` | int | 16 -- 1024 | Number of MinHash permutations |
| `--num-bands <n>` | int | 1 -- 100 | Number of LSH bands |
| `--ngram-size <n>` | int | 1 -- 10 | Word n-gram size for shingling |
| `--min-words <n>` | int | 1 -- 1000 | Minimum word count for analysis |
| `--weight-jaccard <n>` | int | 0 -- 100 | Confidence weight for Jaccard similarity |
| `--weight-fuzzy <n>` | int | 0 -- 100 | Confidence weight for fuzzy text |
| `--weight-metadata <n>` | int | 0 -- 100 | Confidence weight for metadata |
| `--weight-filename <n>` | int | 0 -- 100 | Confidence weight for filename |
| `--fuzzy-sample-size <n>` | int | 100 -- 100,000 | Character sample size for fuzzy comparison |
| `--auto-analyze <bool>` | string | `true`/`false` | Auto-analyze after sync |

!!! warning "Weight Constraint"
    The four confidence weights (`--weight-jaccard`, `--weight-fuzzy`, `--weight-metadata`, `--weight-filename`) must sum to 100.

**Examples:**

```bash
# Lower the similarity threshold
paperless-dedupe config set --similarity-threshold 0.6

# Adjust confidence weights to prioritize text content
paperless-dedupe config set \
  --weight-jaccard 50 \
  --weight-fuzzy 35 \
  --weight-metadata 10 \
  --weight-filename 5

# Disable auto-analysis
paperless-dedupe config set --auto-analyze false
```

---

### `export duplicates`

Export duplicate groups as CSV.

```bash
paperless-dedupe export duplicates [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--min-confidence <n>` | none | Minimum confidence score (0.0 -- 1.0) |
| `--status <status>` | none | Filter by status (e.g., `pending`, `false_positive`, `ignored`, `deleted`) |

**Examples:**

```bash
# Export all duplicates
paperless-dedupe export duplicates > duplicates.csv

# Export high-confidence pending only
paperless-dedupe export duplicates \
  --min-confidence 0.9 \
  --status pending > high-confidence.csv

# JSON format
paperless-dedupe export duplicates --json > duplicates.json
```

---

### `export config`

Export configuration backup as JSON.

```bash
paperless-dedupe export config
```

**Examples:**

```bash
# Export to file
paperless-dedupe export config > config-backup.json
```

---

## Environment Variables

The CLI reads environment variables from the `.env` file (or the path specified by `--env-file`). The following variables are used:

| Variable | Description |
|----------|-------------|
| `PAPERLESS_URL` | Paperless-NGX instance URL |
| `PAPERLESS_API_TOKEN` | API authentication token |
| `PAPERLESS_USERNAME` | Username (alternative to token) |
| `PAPERLESS_PASSWORD` | Password (with username) |
| `DATABASE_URL` | SQLite database file path |
| `LOG_LEVEL` | Log verbosity |

See [Configuration](configuration.md) for details on all environment variables.

## Common Workflows

### Automated Sync + Analysis

```bash
#!/bin/bash
# Cron job: sync and analyze nightly

paperless-dedupe sync --json 2>/dev/null | jq '.totalFetched'
paperless-dedupe analyze --json 2>/dev/null | jq '.groupsCreated'
```

### Export Report

```bash
# Generate a report of high-confidence pending duplicates
paperless-dedupe export duplicates \
  --min-confidence 0.85 \
  --status pending > report.csv

echo "Found $(wc -l < report.csv) duplicate entries"
```

### Monitor Status

```bash
# Quick status check
paperless-dedupe status --json | jq '{
  documents: .dashboard.totalDocuments,
  pending: .dashboard.pendingGroups,
  savings: .dashboard.storageSavingsBytes
}'
```
