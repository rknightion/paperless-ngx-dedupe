# Observability Improvements Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Approach:** Foundation → Correlation → New Capabilities (executed as single parallelized run)

## Context

The app already has a production-ready observability stack: full OTel SDK (traces, metrics, logs), Grafana Faro frontend instrumentation, Pino logging with trace context, worker thread context propagation, 15+ custom metrics, and 10 Paperless-NGX system metric collectors.

This spec addresses standards alignment gaps, missing cross-signal correlation, and new capabilities (continuous profiling) to bring the stack to showcase quality. The app is used for Grafana demos, so completeness and standards compliance matter.

**Deployment:** Docker Compose. Direct-to-Grafana-Cloud OTLP ingestion (no Alloy in compose). Alloy documented as optional enhancement.

---

## Layer 1: Foundation — Standards Alignment

### 1a. Semantic Conventions Full Audit & Migration

Every custom attribute and span name in the codebase gets aligned to OTel semconv.

#### Database Attributes (stable)

Set `OTEL_SEMCONV_STABILITY_OPT_IN=database` as a documented recommendation.

| Current | New (stable semconv) |
|---|---|
| `db.system` | `db.system.name` |
| `db.operation` | `db.operation.name` |
| `db.statement` | `db.query.text` |

Location: `packages/core/src/telemetry/drizzle-logger.ts`

#### GenAI Attributes (experimental semconv, adopted proactively)

| Current | New |
|---|---|
| `ai.provider` | `gen_ai.system` |
| `ai.model` | `gen_ai.request.model` |
| `ai.batch_size` | `gen_ai.request.batch_size` |
| `ai.target_rpm` | `gen_ai.request.target_rpm` |
| `ai.total_documents` | `app.ai.total_documents` |
| `ai.reprocess` | `app.ai.reprocess` |
| Token metrics by type `prompt` | `gen_ai.usage.input_tokens` |
| Token metrics by type `completion` | `gen_ai.usage.output_tokens` |

Locations: `packages/core/src/ai/batch.ts`, `packages/core/src/telemetry/metrics.ts`

#### Job/App Attributes

| Current | New |
|---|---|
| `job.id` | `app.job.id` |

Location: `packages/core/src/jobs/worker-entry.ts`

#### HTTP Spans

Verify `hooks.server.ts` enrichment uses stable attribute names (`http.route`). Auto-instrumentation should handle `http.request.method`, `http.response.status_code`, `url.full` via the stable semconv.

#### Metric Instrument Units

Add `unit` to all metric instruments where missing:
- Duration histograms: `s`
- Byte measurements: `By`
- Counts: `{document}`, `{token}`, `{request}`, `{job}`, `{run}`, etc.

### 1b. Resource Detectors & Identification

In `telemetry.cjs`:
- Explicitly configure resource detectors: `env`, `host`, `os`, `process`, `container`
- Add `service.namespace` resource attribute:
  - New env var: `OTEL_SERVICE_NAMESPACE` (default: `paperless-dedupe`)
  - Set on both backend resource and Faro `app.namespace`

### 1c. OTLP Compression

- Configure gzip compression on OTLP exporters
- Document `OTEL_EXPORTER_OTLP_COMPRESSION=gzip` in `.env.example`

### 1d. Span Events to Log-Based Events Migration

Migrate away from the deprecated `Span.AddEvent()` and `Span.RecordException()` APIs.

**Drizzle logger** (`packages/core/src/telemetry/drizzle-logger.ts`):
- Replace `span.addEvent('db.query', attributes)` with a log record emitted via the OTel Logs API, correlated with the active span context
- The log record carries the same attributes (`db.system.name`, `db.operation.name`, `db.query.text`) plus severity and timestamp

**Exception recording:**
- Audit all `span.recordException()` call sites
- Replace with log records at ERROR severity, correlated via span context
- Include exception attributes: `exception.type`, `exception.message`, `exception.stacktrace`

---

## Layer 2: Correlation — End-to-End Tracing

### 2a. Faro TracingInstrumentation

Wire up `@grafana/faro-web-tracing` in `packages/web/src/lib/faro.ts`:

```typescript
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// Add to instrumentations array:
new TracingInstrumentation({
  instrumentationOptions: {
    propagateTraceHeaderCorsUrls: [
      // Same-origin, match the app's base URL
      new RegExp(`${window.location.origin}/api/.*`),
    ],
  },
})
```

This injects `traceparent`/`tracestate` headers into frontend fetch requests to the backend API, creating connected traces from UI interaction through to database queries.

### 2b. Service Namespace Correlation

- Backend: set `service.namespace` in resource attributes (from `OTEL_SERVICE_NAMESPACE` env var)
- Frontend: set `app.namespace` in Faro config to the same value
- Result: Grafana Cloud App O11y displays frontend and backend as one logical application

### 2c. Exemplar Support

- OTLP metrics payload includes exemplars automatically when there's an active span context during metric recording — no app-side code changes needed for direct OTLP ingestion
- Documentation: when using Alloy, `send_exemplars = true` must be set on Prometheus remote write
- Documentation: Grafana dashboard panels need the Exemplars toggle enabled and Prometheus data source linked to Tempo

### 2d. Backend CORS for Trace Headers

- Verify SvelteKit allows `traceparent` and `tracestate` request headers
- Same-origin requests should work without CORS configuration, but verify no middleware strips these headers

---

## Layer 3: New Capabilities

### 3a. Pyroscope Continuous Profiling

#### Configuration

New env vars (added to Zod config schema in `config.ts`):

| Variable | Default | Description |
|---|---|---|
| `PYROSCOPE_ENABLED` | `false` | Enable continuous profiling |
| `PYROSCOPE_SERVER_ADDRESS` | (none) | Grafana Cloud Pyroscope endpoint |
| `PYROSCOPE_BASIC_AUTH_USER` | (none) | Grafana Cloud instance ID |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | (none) | Grafana Cloud API key |

#### Integration

Initialize in `telemetry.cjs` alongside the OTel SDK, guarded by `PYROSCOPE_ENABLED`:
- Wall-time profiling enabled (with `collectCpuTime: true`)
- Heap profiling enabled
- App name derived from `OTEL_SERVICE_NAME`
- Environment tag from `OTEL_DEPLOYMENT_ENVIRONMENT`

#### Operation Labels

Wrap key code paths with `Pyroscope.wrapWithLabels()` for flame graph filtering:

| Label | Location | Purpose |
|---|---|---|
| `operation: 'sync'` | `sync-documents.ts` | Document sync from Paperless |
| `operation: 'analysis'` | `analyze.ts` | Dedup analysis pipeline |
| `operation: 'ai_batch'` | `batch.ts` | AI batch processing |
| `operation: 'worker'` | `worker-entry.ts` | Generic worker task execution |

These wraps co-locate with existing `withSpan` calls.

#### Dependency & Cross-Package Strategy

Add `@pyroscope/nodejs` to `packages/core` as an optional dependency. Create a `withPyroscopeLabels(labels, fn)` helper in `packages/core/src/telemetry/` that:
- Wraps `Pyroscope.wrapWithLabels()` when Pyroscope is initialized
- No-ops (just calls `fn` directly) when Pyroscope is not available

This matches the existing pattern where core telemetry helpers gracefully no-op when OTel isn't active. Initialization still happens in `telemetry.cjs` (web package), but label wrapping happens at the call sites in core.

### 3b. Documentation Updates

Create/update OTel documentation covering:

1. **Alloy configuration guide** — complete config block for OTLP routing to Grafana Cloud with batching, retry, compression, `send_exemplars = true`
2. **Grafana Cloud setup** — OTLP gateway endpoint, auth headers, verifying data flow per signal
3. **Dashboard guidance** — enabling exemplars on panels, Prometheus → Tempo data source linking, App O11y with `service.namespace`
4. **Pyroscope setup** — env vars, expected flame graph output, filtering by operation label
5. **Environment variable reference** — update `.env.example` with all new vars

---

## Files Modified

### Core changes
- `packages/core/src/telemetry/drizzle-logger.ts` — semconv migration + span events → logs
- `packages/core/src/telemetry/metrics.ts` — semconv attribute names, metric units, token type labels
- `packages/core/src/telemetry/spans.ts` — audit span attribute names, exception recording
- `packages/core/src/ai/batch.ts` — GenAI semconv attributes
- `packages/core/src/jobs/worker-entry.ts` — `app.job.id` attribute
- `packages/core/src/sync/sync-documents.ts` — Pyroscope label wrap
- `packages/core/src/dedup/analyze.ts` — Pyroscope label wrap
- `packages/core/src/config.ts` — new Pyroscope env vars in Zod schema

### Web changes
- `packages/web/telemetry.cjs` — resource detectors, service.namespace, Pyroscope init, gzip compression
- `packages/web/src/lib/faro.ts` — TracingInstrumentation, app.namespace
- `packages/core/package.json` — add `@pyroscope/nodejs` optional dependency
- `packages/core/src/telemetry/pyroscope.ts` — `withPyroscopeLabels` helper (no-ops when disabled)

### Documentation
- `.env.example` — all new env vars
- `docs/observability.md` — Alloy config, Grafana Cloud setup, dashboard guidance, Pyroscope

### Tests
- Update any existing telemetry tests to reflect new attribute names
- Verify Pyroscope init is guarded by feature flag

---

## Out of Scope

- Grafana Alloy in Docker Compose (documented only)
- Span-profile linking (not available for Node.js)
- Declarative OTel configuration via YAML (`OTEL_CONFIG_FILE`) — env vars sufficient for this app's complexity
- Tail sampling (requires a collector; document as Alloy feature)
