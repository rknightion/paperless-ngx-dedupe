---
title: Observability
description: OpenTelemetry traces, metrics, and logs; Grafana Faro frontend instrumentation; and Pyroscope continuous profiling for Paperless NGX Dedupe
---

# Observability Guide

Observability in Paperless NGX Dedupe is comprehensive OpenTelemetry support: traces, metrics, and logs from the backend; Grafana Faro instrumentation from the frontend; and optional Pyroscope continuous profiling. This guide covers configuring all three for Grafana Cloud or a self-hosted OTLP collector.

## Quick Start — Grafana Cloud

Set these environment variables to send all telemetry to Grafana Cloud:

```bash
# Backend telemetry (traces, metrics, logs)
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-<region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:apiKey)>
OTEL_EXPORTER_OTLP_COMPRESSION=gzip
OTEL_SERVICE_NAMESPACE=paperless-dedupe

# Frontend telemetry (errors, Web Vitals, distributed traces)
FARO_ENABLED=true
FARO_COLLECTOR_URL=https://faro-collector-prod-<region>.grafana.net/collect/<app-key>

# Continuous profiling (optional)
PYROSCOPE_ENABLED=true
PYROSCOPE_SERVER_ADDRESS=https://profiles-prod-<region>.grafana.net
PYROSCOPE_BASIC_AUTH_USER=<instance-id>
PYROSCOPE_BASIC_AUTH_PASSWORD=<api-key>

# Stable semantic conventions
OTEL_SEMCONV_STABILITY_OPT_IN=database
```

## Application State Gauges

The server registers these gauges when either `OTEL_ENABLED` or `OTEL_PROMETHEUS_ENABLED` is true.
They do not require the optional Paperless metrics collectors. With telemetry disabled no application
gauge query runs. All gauges share one snapshot cached for 15 seconds, so repeated scrapes reuse the
same database reads. Refreshing the snapshot uses five small statements: document count, pending
group counts, job/dispatch counts, AI review count and the singleton success timestamps.

| OpenTelemetry name | Value | Labels |
| --- | --- | --- |
| `paperless_ngx_dedupe.documents_count` | Locally synced documents | None |
| `paperless_ngx_dedupe.duplicates.unresolved_count` | Pending duplicate groups | None |
| `paperless_ngx_dedupe.jobs.active_count` | Running jobs | None |
| `paperless_ngx_dedupe.ai.pending_count` | AI results awaiting review | None |
| `paperless_ngx_dedupe.sync.last_success_timestamp` | Stored last successful sync time, seconds since epoch | None |
| `paperless_ngx_dedupe.analysis.last_success_timestamp` | Stored last successful analysis time, seconds since epoch | None |
| `paperless_ngx_dedupe.duplicates.pending_count` | Pending groups in each review queue | `confidence`: `high` or `ambiguous` |
| `paperless_ngx_dedupe.jobs.dead_letter_count` | Durable dispatch intents in the dead-letter state, awaiting manual recovery | None |

Success timestamps have no sample before the first success; they are not zero or the server start
time. High confidence uses the same threshold as the review inbox (currently 0.95); ambiguous is
the remaining pending groups. Resolved groups and ordinary failed jobs are not backlog samples.
Dead letters include exhausted launch attempts and terminal automated failures; a retry removes the
intent from that count. No gauge labels contain document, job or entity identifiers.

These are OpenTelemetry instrument names. Prometheus replaces separators and may append unit
suffixes, so inspect the local `/api/v1/metrics` exposition when writing PromQL. Worker counters and
histograms still require the OTLP pipeline described below; they do not appear in the server scrape.

## End-to-End Trace Correlation

Frontend and backend traces are automatically correlated when both `OTEL_ENABLED` and `FARO_ENABLED` are set. Faro injects `traceparent` and `tracestate` headers into API requests, which the backend OTel instrumentation picks up to create connected traces.

Both services share the same `service.namespace` (`paperless-dedupe` by default), which groups them as one logical application in Grafana Cloud Application Observability.

The server and worker `service.version` resource attribute uses the image version from `APP_VERSION`: the release tag, release candidate tag, or commit for edge builds. Local images without a version build argument report `dev`. Outside Docker, the fallback is `npm_package_version`, then `0.0.0`. Diagnostics retain the application version and add a separate build identity; unrecognized custom labels are redacted.

## Grafana Alloy (Optional)

For production deployments with multiple instances, a Grafana Alloy collector provides retry buffering, metadata enrichment, and exemplar relay. The app can send directly to Grafana Cloud for simpler setups.

### Alloy Configuration

```alloy
otelcol.receiver.otlp "default" {
  grpc { endpoint = "0.0.0.0:4317" }
  http  { endpoint = "0.0.0.0:4318" }
  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.otlphttp.grafana_cloud.input]
    logs    = [otelcol.exporter.otlphttp.grafana_cloud.input]
    traces  = [otelcol.exporter.otlphttp.grafana_cloud.input]
  }
}

otelcol.exporter.otlphttp "grafana_cloud" {
  client {
    endpoint = "https://otlp-gateway-prod-<region>.grafana.net/otlp"
    auth     = otelcol.auth.basic.grafana_cloud.handler
  }
}

otelcol.auth.basic "grafana_cloud" {
  username = "<instance-id>"
  password = sys.env("GRAFANA_CLOUD_API_KEY")
}
```

When using Alloy, point the app at the Alloy receiver:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
```

## Exemplars

OTLP metrics include exemplars (trace IDs) automatically when metrics are recorded during an active span. To use exemplars in Grafana:

1. In your dashboard panel, enable the **Exemplars** toggle
2. Configure the Prometheus data source to link its exemplar data source to your Tempo instance
3. Click exemplar diamonds on time series graphs to jump to the associated trace

When routing metrics through Alloy with Prometheus remote write, set `send_exemplars = true`:

```alloy
prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus-<region>.grafana.net/api/prom/push"
    send_exemplars = true
    basic_auth {
      username = "<instance-id>"
      password = sys.env("GRAFANA_CLOUD_API_KEY")
    }
  }
}
```

## Pyroscope Flame Graphs

Profiles cover the main server thread: HTTP handling, page loads and scheduling.
Background jobs run in worker threads and are not profiled or labelled.

## Semantic Conventions

Per-statement `db.query` log records are emitted only at `LOG_LEVEL=debug` or `trace`.

This app follows OpenTelemetry semantic conventions:

- **Database:** Stable conventions (`db.system.name`, `db.operation.name`, `db.query.text`). Set `OTEL_SEMCONV_STABILITY_OPT_IN=database`.
- **GenAI:** Experimental conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.request.batch_size`, `gen_ai.request.target_rpm`, `gen_ai.token.type`).
- **App-specific:** Prefixed with `app.*` (`app.job.id`, `app.ai.total_documents`, `app.batch.*`).

## Application dashboard

Download [the Grafana dashboard JSON](https://github.com/rknightion/paperless-ngx-dedupe/blob/main/deploy/grafana/paperless-ngx-dedupe.json),
import it into Grafana, and select a Prometheus datasource. It includes overview, sync, analysis,
review backlog, AI cost and tokens, and Paperless API errors. Queries use the names observed from
the application's Prometheus exporter, including histogram suffixes and normalized label names.

The selected datasource must contain worker metrics received through OTLP for sync and analysis
activity, AI tokens and worker Paperless requests. Scraping only the server metrics endpoint gives
the state gauges and server activity; it does not include worker counters and histograms, even
when both export modes are enabled. Datasource translation settings must preserve the names shown
by the application exporter. Missing series display no data, rather than an invented zero.

The dashboard aggregates the selected datasource's application series. Use a datasource scoped to
one installation when you need an installation-specific view. Last-success panels show the most
recent success among those series and remain empty before the first successful run.

AI cost is not exported as a metric. The cost panel directs you to the application's AI Processing
page for estimates; token counts cannot determine cost without model prices, caching and service
tier. Cached input is a subset of input tokens and must not be added to input to calculate a total.

The dashboard is validated against the telemetry definitions and a local exporter capture. A live
Grafana stack is not part of this repository's validation environment.
