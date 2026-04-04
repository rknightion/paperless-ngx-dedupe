# Observability Guide

Paperless NGX Dedupe ships with comprehensive observability support: OpenTelemetry traces, metrics, and logs; Grafana Faro frontend instrumentation; and optional Pyroscope continuous profiling.

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

## End-to-End Trace Correlation

Frontend and backend traces are automatically correlated when both `OTEL_ENABLED` and `FARO_ENABLED` are set. Faro injects `traceparent` and `tracestate` headers into API requests, which the backend OTel instrumentation picks up to create connected traces.

Both services share the same `service.namespace` (`paperless-dedupe` by default), which groups them as one logical application in Grafana Cloud Application Observability.

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

When Pyroscope is enabled, profiles are labeled by operation type:

| Label | Code Path |
| --- | --- |
| `operation=sync` | Document sync from Paperless-NGX |
| `operation=analysis` | Deduplication analysis pipeline |
| `operation=ai_batch` | AI batch document processing |
| `operation=worker` | Generic worker thread execution |

Filter flame graphs in Grafana Pyroscope by these labels to isolate CPU/memory hotspots per operation.

## Semantic Conventions

This app follows OpenTelemetry semantic conventions:

- **Database:** Stable conventions (`db.system.name`, `db.operation.name`, `db.query.text`). Set `OTEL_SEMCONV_STABILITY_OPT_IN=database`.
- **GenAI:** Experimental conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`).
- **App-specific:** Prefixed with `app.*` (`app.job.id`, `app.ai.total_documents`, `app.batch.*`).
