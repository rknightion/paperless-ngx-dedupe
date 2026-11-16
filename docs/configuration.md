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
| `PAPERLESS_READ_ONLY` | No | `false` | Block Paperless mutations; local review state and settings stay writable. Environment-owned. |
| `PAPERLESS_API_TOKEN` | Yes* | - | Preferred auth method |
| `PAPERLESS_USERNAME` | No | - | Use with `PAPERLESS_PASSWORD` when not using token |
| `PAPERLESS_PASSWORD` | No | - | Use with `PAPERLESS_USERNAME` |
| `DATABASE_URL` | No | `./data/paperless-ngx-dedupe.db` | SQLite file path |
| `PORT` | No | `3000` | Host port under Compose, where the container listens on 3000; listen port for the built server outside Docker |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error`. Per-statement `db.query` logs are emitted only at `debug` or `trace`. |
| `CORS_ALLOW_ORIGIN` | No | empty | Empty = same-origin only; `*` = allow all |
| `AUTO_MIGRATE` | No | `true` | Auto-run DB schema migration on startup |

\* Provide either `PAPERLESS_API_TOKEN` or both `PAPERLESS_USERNAME` + `PAPERLESS_PASSWORD`.

If both token and username/password are set, token is used first.

Paperless connection settings and all credentials are environment-owned. The Settings page exposes
the configured URL as read-only and only reports whether authentication is configured; it never
reads, stores, exports, or accepts these values through the database or configuration API. Existing
legacy credential rows in `app_config` are removed during startup migration. Keep the values in your
deployment environment or secret manager when moving an installation.

### Access Protection

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `APP_AUTH_MODE` | No | `none` | `none` keeps access open; `basic` requires a shared credential; `proxy` trusts identity only from configured proxy CIDRs |
| `APP_AUTH_USERNAME` | In basic mode | - | Shared application username, separate from Paperless authentication |
| `APP_AUTH_PASSWORD` | In basic mode | - | Shared application password; sensitive and environment-owned |
| `APP_AUTH_PROXY_HEADER` | No | `Remote-User` | Identity header set by the authenticating proxy |
| `APP_AUTH_TRUSTED_PROXIES` | In proxy mode | - | Comma-separated IPv4 or IPv6 CIDRs for the directly connecting proxies |
| `APP_API_TOKEN` | No | - | Sensitive bearer token accepted on `/api/v1/*` in any supported mode |

Basic mode refuses to start without both username and password. Proxy mode refuses to start
without a valid, nonempty trusted CIDR list; plain addresses need a /32 or /128 prefix. Keep these credentials in the
deployment environment; the configuration API cannot change or export them. GET health and
readiness probes and OPTIONS requests remain unauthenticated; metrics require credentials when
protection is enabled. For scripts, send `Authorization: Bearer <app-api-token>`.
See the [access model](security.md#access-model) for the default trust boundary and HTTPS guidance.

### Container Runtime

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PUID` | No | `1000` | UID used inside the container |
| `PGID` | No | `1000` | GID used inside the container |

### SvelteKit / Proxy

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ORIGIN` | Usually no | - | Set when running behind reverse proxies or non-localhost hostnames to satisfy origin checks |
| `BODY_SIZE_LIMIT` | No | `512K` | Node adapter request body limit (524,288 bytes). Vite preview does not apply this adapter limit. |

The Node adapter limits request bodies independently of API validation. Large batch status selections in the wizard are sent in groups of 10,000.

### AI Processing (Optional)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_ENABLED` | No | `false` | Enable AI-powered document classification |
| `AI_BULK_ALL_ENABLED` | No | `false` | Allow the apply-all and reject-all API endpoints |
| `AI_OPENAI_API_KEY` | When AI enabled without a base URL | - | API key for the configured AI server |
| `AI_OPENAI_BASE_URL` | No | - | Absolute http or https endpoint for an OpenAI-compatible server; disables Flex |
| `AI_OPENAI_API_STYLE` | No | `responses` | `responses` for Responses API or `chat` for JSON-schema Chat Completions |

The API key is required when `AI_ENABLED=true` unless `AI_OPENAI_BASE_URL` is set. Runtime settings (model, prompt, etc.) are configured in the Settings page or via API. See [AI Processing](ai-processing.md) for full details.

### Notifications (Optional)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NOTIFY_URL` | To send notifications | - | Sensitive outbound destination URL; environment-owned, never stored in the database |
| `NOTIFY_FORMAT` | No | `json` | Receiver format: `json`, `ntfy` or `apprise` |
| `NOTIFY_AUTH_HEADER` | No | - | Sensitive literal `Authorization` header value sent to the receiver |

Set the destination in the deployment environment and restart the app. In **Settings > Automation >
Notifications**, choose the events and use **Send test** to send a synthetic, zero-count event.
The card reports whether a destination is configured and its format, without exposing the URL or
authorization value. Set `ORIGIN` to the application's public URL to include review or activity links.
Apprise can forward notifications to its configured email and messaging services.

These preferences are stored in the database and can also be set through the configuration API:

| Key | Default | Meaning |
| --- | --- | --- |
| `notifications.onNewDuplicates` | `true` | Notify after analysis creates enough new groups |
| `notifications.minNewGroups` | `1` | Minimum new groups in that run, an integer from 1 to 10000 |
| `notifications.onJobFailure` | `true` | Notify when a worker job reaches terminal failure, after retries are exhausted |
| `notifications.scheduledRunsOnly` | `true` | Notify for scheduled work and its dependencies; turn off to include manual runs |

With `NOTIFY_URL` unset, no notification requests are made. Delivery starts after the job's terminal
transition and lease release, so receiver failure cannot change the job's result. A delivery uses
at most three attempts, each with a 10-second timeout. Retry waits start at 1 and 4 seconds, include
jitter, honor `Retry-After` within a 10-second cap, and total at most 50 seconds including requests.
The **Send test** button waits for that delivery result. Process crashes and failures before a worker
starts do not pass through the worker failure hook and do not send notifications.

Payloads contain counts, job identifiers and an optional application link, never document titles,
text or raw job errors. See [Security](security.md#where-document-content-can-leave-the-deployment)
and the [notification API](api-reference.md#get-apiv1notifications).

### Webhook Sync (Optional)

In **Settings > Automation > Webhook sync**, enable consumption-triggered sync and choose how
long to wait after the most recent webhook. These preferences are stored in the database:

| Key | Default | Meaning |
| --- | --- | --- |
| `automation.webhookSyncEnabled` | `false` | Accept authenticated requests to the Paperless webhook endpoint |
| `automation.webhookQuietSeconds` | `60` | Quiet period in seconds, an integer from 10 to 3600 |

Configure `APP_API_TOKEN` in the deployment environment and restart before sending webhooks.
The Settings card reports whether a token is configured without exposing it. Enabling the
preference does not remove the token requirement. See [Trigger on consumption](getting-started.md#trigger-on-consumption)
for the Paperless workflow setup and the [webhook API](api-reference.md#post-apiv1hookspaperless)
for response details.

### Observability (Optional)

`APP_VERSION` is set by the image build and reported as `service.version`; it is not meant to be overridden.

OpenTelemetry is off unless `OTEL_ENABLED=true`. Common vars:

- `OTEL_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (or per-signal endpoints)
- `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER`

See `.env.example` for the full list.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OTEL_SERVICE_NAMESPACE` | No | `paperless-dedupe` | Groups frontend and backend as one app in Grafana Cloud App Observability |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | No | (none) | Set to `gzip` for Grafana Cloud (recommended) |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | No | (none) | Set to `database` to use stable DB semantic conventions |

### Continuous Profiling (Optional)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PYROSCOPE_ENABLED` | No | `false` | Enable wall-time and heap profiling |
| `PYROSCOPE_SERVER_ADDRESS` | When Pyroscope enabled | - | Grafana Cloud Pyroscope endpoint or self-hosted URL |
| `PYROSCOPE_BASIC_AUTH_USER` | For Grafana Cloud | - | Grafana Cloud instance ID |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | For Grafana Cloud | - | Grafana Cloud API key |

### Frontend Observability

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `FARO_ENABLED` | No | `false` | Enable Grafana Faro Web SDK instrumentation |
| `FARO_COLLECTOR_URL` | When Faro enabled | - | Faro collector URL; obtain it from Grafana Cloud under Observability, Frontend, Create new |

### Prometheus Scrape Endpoint (Optional)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OTEL_PROMETHEUS_ENABLED` | No | `false` | Expose a Prometheus scrape endpoint at `/api/v1/metrics` |

When enabled, `GET /api/v1/metrics` exposes metrics recorded by the server thread:

- Application gauges for documents, unresolved duplicates, active jobs and pending AI results.
- Job lifecycle events handled by the server, such as cancellation and worker launch failures.
- Paperless requests made by the server and optional Paperless system collectors.
- AI result rejection handled by the server.
- HTTP instrumentation metrics when `OTEL_ENABLED=true` also enables auto-instrumentation.

The endpoint can be used standalone without `OTEL_ENABLED`. Sync, analysis and AI processing counters and histograms are recorded in worker threads and require `OTEL_ENABLED=true` with an OTLP metrics exporter. Worker job lifecycle events, Paperless requests and AI apply or revert operations also use that worker pipeline. These worker metrics never reach the scrape endpoint, even when both pipelines are enabled.

### Paperless-NGX System Metrics (Optional)

When enabled, Paperless NGX Dedupe collects system-level metrics from your Paperless-NGX instance — storage, document counts, tags, correspondents, and more. This provides the same observability as running a separate [prometheus-paperless-exporter](https://github.com/hansmi/prometheus-paperless-exporter) container, but delivered through whichever metrics pipeline you have active (OTLP, Prometheus, or both) — one fewer container to manage.

For the supported collectors, metric names match the Prometheus exporter (for example,
`paperless_status_storage_total_bytes` and `paperless_statistics_documents_total`) for Grafana
dashboard compatibility. Exporter collectors that this application does not provide, such as
individual task and log metrics, are not exposed.

!!! note "Separately opt-in"
    This is opt-in independently of `OTEL_ENABLED` / `OTEL_PROMETHEUS_ENABLED` because collectors poll the Paperless-NGX API, adding load to your Paperless instance. Enable only the collectors you need if this is a concern.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PAPERLESS_METRICS_ENABLED` | No | `false` | Enable Paperless system metrics collection. Requires `OTEL_ENABLED=true` or `OTEL_PROMETHEUS_ENABLED=true`. |
| `PAPERLESS_METRICS_COLLECTORS` | No | all | Comma-separated list of collectors to enable |

Paperless-NGX 3.x applies permissions to system-wide observability data. The API user needs
`paperless.view_system_monitoring` for the `status` collector. Grant
`paperless.view_global_statistics` if the `statistics` and `document` collectors should report
global counts; without it, Paperless returns counts limited to objects visible to that user.

**Available collectors:**

| Collector | API Calls | Description |
| --- | --- | --- |
| `status` | 1 | Storage, database, Redis, Celery, index, classifier, and sanity check status |
| `statistics` | 1 + paginated on Paperless 2.x | Document totals, inbox count, file type breakdown, character count, metadata counts |
| `document` | 1 (shared with `statistics`) | Total document count |
| `tag` | paginated | Per-tag info, document counts, inbox flag |
| `correspondent` | paginated | Per-correspondent info, document counts, last correspondence timestamp |
| `document_type` | paginated | Per-document-type info and document counts |
| `storage_path` | paginated | Per-storage-path info and document counts |
| `group` | 1 | User group count |
| `user` | 1 | User count |
| `remote_version` | 1 | Update availability check (causes Paperless-NGX to make an outbound network call) |

These counts describe the current series from each collector after a successful collection; other application metrics are additional.

| Collector | Series | Notes |
| --- | --- | --- |
| `status` | 12 | Fixed system status and storage gauges |
| `statistics` | 7 + 1 per MIME type | Fixed totals plus the file type breakdown |
| `document` | 1 | Total document count |
| `tag` | 3 per tag | Info, document count and inbox flag; changing name or slug creates a new info series |
| `correspondent` | 3 per correspondent | Info, document count and last correspondence; changing name or slug creates a new info series |
| `document_type` | 2 per document type | Info and document count; changing name or slug creates a new info series |
| `storage_path` | 2 per storage path | Info and document count; changing name or slug creates a new info series |
| `group` | 1 | Total group count |
| `user` | 1 | Total user count |
| `remote_version` | 1 | Update availability; a changed version label creates a new series |

Estimate the total by multiplying each per-entity count by the number of entities and adding the fixed counts and MIME types: 3,000 correspondents and 500 tags alone produce 10,500 series, and historical series from renamed entities can add to backend retention totals.
When the metrics backend bills per series, use `PAPERLESS_METRICS_COLLECTORS` to leave out per-entity collectors and limit series count.

All collectors are enabled by default. To enable only specific collectors:

```bash
PAPERLESS_METRICS_COLLECTORS=status,statistics,document
```

Paperless metrics are polled every 60 seconds. The interval is fixed and is independent of `OTEL_METRIC_EXPORT_INTERVAL`.

Credit: metric definitions and collector design inspired by [prometheus-paperless-exporter](https://github.com/hansmi/prometheus-paperless-exporter) by hansmi.

## Deduplication Settings

`dedup.primaryStrategy` controls the keeper for newly created groups. The default
`lowest_id` preserves the lowest Paperless ID. Other choices are `oldest_added`,
`newest_added`, `most_text` (word count), and `most_metadata` (non-empty categories:
correspondent, document type, tags and custom fields). Ties use the lowest ID;
missing or invalid added dates rank after known dates. A custom field with value
zero or false counts as filled. Existing groups keep their current primary when
the setting changes, including during forced analysis. File-based rules are not
part of this setting. Configure it through the config API until the Settings UI
is available.

Change these in **Settings** or via `PUT /api/v1/config/dedup`.

### Algorithm Parameters

| Setting | Default | Range | Notes |
| --- | --- | --- | --- |
| `numPermutations` | `256` | 16-1024 | MinHash signature length |
| `numBands` | `32` | 1-100 | LSH bands; must not exceed `numPermutations`; even division uses every signature position |
| `ngramSize` | `3` | 1-10 | Word shingle size |
| `minWords` | `20` | 1-1000 | Skip very short docs below this |
| `similarityThreshold` | `0.75` | 0-1 | Minimum overall similarity to keep a pair |
| `fuzzySampleSize` | `10000` | 100-100000 | Character sample size for fuzzy compare |
| `autoAnalyze` | `true` | boolean | Deprecated, has no effect. Use the Analysis schedule in Settings > Automation. |

### Confidence Weights

The confidence model uses a **2-weight base score** plus a **discriminative penalty**:

**Base weights** are integers `0-100` and **must sum to 100**:

| Setting | Default | Notes |
| --- | --- | --- |
| `confidenceWeightJaccard` | `60` | Weight for Jaccard (set overlap) similarity |
| `confidenceWeightFuzzy` | `40` | Weight for fuzzy (edit distance) similarity |

**Discriminative penalty** reduces confidence when template-based documents have different structured data (dates, amounts, invoice numbers, routes):

| Setting | Default | Range | Notes |
| --- | --- | --- | --- |
| `discriminativePenaltyStrength` | `70` | 0-100 | How aggressively differing structured data reduces confidence (0 = disabled) |

The final confidence formula is:

```text
base  = (jaccard × J_weight + fuzzy × F_weight) / (J_weight + F_weight)
final = base × (1 - penalty_strength/100 × (1 - discriminative_score))
```

When the discriminative score is high (documents share the same dates, amounts, and references), the penalty has little effect. When it is low (documents have different dates, amounts, invoice numbers, or routes despite sharing a template), the penalty reduces the confidence score.

**Strength guidelines:**

- **Low (0-30%):** Minimal impact. Monthly invoices or train tickets with different dates may still appear as duplicates.
- **Medium (40-70%):** Recommended for most libraries. Catches template-based false positives while keeping true duplicates intact.
- **High (80-100%):** Aggressive. Best for libraries with many monthly invoices, bank statements, or train/flight tickets. May over-penalize minor OCR differences in dates or amounts.

When any weight or penalty strength changes, existing group confidence scores are recalculated automatically.

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
    "confidenceWeightJaccard":70,
    "confidenceWeightFuzzy":30
  }'

# Adjust discriminative penalty strength (0 = disabled, 100 = maximum)
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{"discriminativePenaltyStrength":75}'
```

### Custom AI model prices

`ai.customInputPricePerMTok` and `ai.customOutputPricePerMTok` are database settings
for USD per million input and output tokens. Both default to 0 and accept finite,
non-negative numbers. An exact cached model price wins; otherwise these settings
supply the rate. A pair of zero rates is accepted only when `AI_OPENAI_BASE_URL`
is configured. Set the fields without the `ai.` prefix through
`PUT /api/v1/ai/config`. See [AI cost tracking](ai-processing.md#cost-tracking)
for scheduled requests and tokenizer limits.


## Related

- [Installation](installation.md)
- [How It Works](how-it-works.md)
- [API Reference](api-reference.md)
