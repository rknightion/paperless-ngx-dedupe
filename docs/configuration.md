---
title: Configuration
description: Environment variables and deduplication settings for Paperless NGX Dedupe
---

# Configuration Reference

Paperless NGX Dedupe uses:

- **Environment variables** for server/runtime behavior
- **Dedup settings** stored in the app database and editable at runtime

## Environment Variables

### Core Runtime

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PAPERLESS_URL` | Yes | - | Full Paperless-NGX URL (for example `http://paperless:8000`) |
| `PAPERLESS_API_TOKEN` | Yes* | - | Preferred auth method |
| `PAPERLESS_USERNAME` | No | - | Use with `PAPERLESS_PASSWORD` when not using token |
| `PAPERLESS_PASSWORD` | No | - | Use with `PAPERLESS_USERNAME` |
| `DATABASE_URL` | No | `./data/paperless-ngx-dedupe.db` | SQLite file path |
| `PORT` | No | `3000` | Web/API listen port |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `CORS_ALLOW_ORIGIN` | No | empty | Empty = same-origin only; `*` = allow all |
| `AUTO_MIGRATE` | No | `true` | Auto-run DB schema migration on startup |

\* Provide either `PAPERLESS_API_TOKEN` or both `PAPERLESS_USERNAME` + `PAPERLESS_PASSWORD`.

If both token and username/password are set, token is used first.

### Container Runtime

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PUID` | No | `1000` | UID used inside the container |
| `PGID` | No | `1000` | GID used inside the container |

### SvelteKit / Proxy

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ORIGIN` | Usually no | - | Set when running behind reverse proxies or non-localhost hostnames to satisfy origin checks |

### Observability (Optional)

OpenTelemetry is off unless `OTEL_ENABLED=true`. Common vars:

- `OTEL_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (or per-signal endpoints)
- `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER`

See `.env.example` for the full list.

### Paperless-NGX System Metrics (Optional)

When enabled, Paperless NGX Dedupe can collect and emit system-level metrics from your Paperless-NGX instance via OTEL. This provides the same observability as running a separate [prometheus-paperless-exporter](https://github.com/hansmi/prometheus-paperless-exporter) container, but delivered through your existing OTEL pipeline -- one fewer container to manage.

Metric names match the Prometheus exporter exactly (e.g. `paperless_status_storage_total_bytes`, `paperless_statistics_documents_total`) for Grafana dashboard compatibility.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PAPERLESS_METRICS_ENABLED` | No | `false` | Enable Paperless system metrics collection (requires `OTEL_ENABLED=true`) |
| `PAPERLESS_METRICS_COLLECTORS` | No | all | Comma-separated list of collectors to enable |

**Available collectors:**

| Collector | API Calls | Description |
| --- | --- | --- |
| `status` | 1 | Storage, database, Redis, Celery, index, classifier, and sanity check status |
| `statistics` | 1 + paginated | Document totals, inbox count, file type breakdown, character count, metadata counts |
| `document` | 1 | Total document count |
| `tag` | paginated | Per-tag info, document counts, inbox flag |
| `correspondent` | paginated | Per-correspondent info, document counts, last correspondence timestamp |
| `document_type` | paginated | Per-document-type info and document counts |
| `storage_path` | paginated | Per-storage-path info and document counts |
| `task` | 1 | Background task info, status, timestamps |
| `group` | 1 | User group count |
| `user` | 1 | User count |
| `remote_version` | 1 | Update availability check (causes Paperless-NGX to make an outbound network call) |

All collectors are enabled by default. To enable only specific collectors:

```bash
PAPERLESS_METRICS_COLLECTORS=status,statistics,document
```

Metrics are collected on the same interval as OTEL metric exports (controlled by `OTEL_METRIC_EXPORT_INTERVAL`, default 60s). Instances with many tags, correspondents, or document types will produce proportionally more time series from the labeled collectors (`tag`, `correspondent`, `document_type`, `storage_path`). Disable these if cardinality is a concern.

Credit: metric definitions and collector design inspired by [prometheus-paperless-exporter](https://github.com/hansmi/prometheus-paperless-exporter) by hansmi.

## Deduplication Settings

Change these in **Settings** or via `PUT /api/v1/config/dedup`.

### Algorithm Parameters

| Setting | Default | Range | Notes |
| --- | --- | --- | --- |
| `numPermutations` | `256` | 16-1024 | MinHash signature length |
| `numBands` | `32` | 1-100 | LSH bands; should divide `numPermutations` evenly |
| `ngramSize` | `3` | 1-10 | Word shingle size |
| `minWords` | `20` | 1-1000 | Skip very short docs below this |
| `similarityThreshold` | `0.75` | 0-1 | Minimum overall similarity to keep a pair |
| `fuzzySampleSize` | `10000` | 100-100000 | Character sample size for fuzzy compare |
| `autoAnalyze` | `true` | boolean | Auto-run analysis after sync |

### Confidence Weights

Both are integers `0-100` and **must sum to 100**.

| Setting | Default |
| --- | --- |
| `confidenceWeightJaccard` | `55` |
| `confidenceWeightFuzzy` | `45` |

When any weight changes, existing group confidence scores are recalculated automatically.

## Example API Updates

```bash
# Update threshold
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{"similarityThreshold":0.8}'

# Rebalance weights (must sum to 100)
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{
    "confidenceWeightJaccard":60,
    "confidenceWeightFuzzy":40
  }'
```

## Related

- [Installation](installation.md)
- [How It Works](how-it-works.md)
- [API Reference](api-reference.md)
