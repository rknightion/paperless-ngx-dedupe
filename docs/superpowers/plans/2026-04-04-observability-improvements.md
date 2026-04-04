# Observability Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the observability stack to showcase quality — full standards alignment, end-to-end trace correlation, and continuous profiling.

**Architecture:** Three-layer approach (Foundation → Correlation → New Capabilities). Tasks within each layer are independent and can be parallelized. Layer 2 depends on Layer 1 completion. Layer 3 is independent of Layers 1 and 2.

**Tech Stack:** OpenTelemetry JS SDK, `@opentelemetry/api`, `@opentelemetry/semantic-conventions`, `@grafana/faro-web-sdk`, `@grafana/faro-web-tracing`, `@pyroscope/nodejs`, Pino, Drizzle ORM.

**Parallelization:** Tasks 1-5 (Layer 1) can all run in parallel. Task 6 (Layer 2) depends on Tasks 1 and 3. Tasks 7-8 (Layer 3) can run in parallel with everything. Task 9 (docs) should run last as it references all other changes.

---

## Layer 1: Foundation — Standards Alignment

### Task 1: Migrate Drizzle Logger — Semconv + Log-Based Events

**Files:**
- Modify: `packages/core/src/telemetry/drizzle-logger.ts` (full rewrite, 22 lines)

This task migrates the Drizzle ORM logger from deprecated `Span.addEvent()` to log-based events using the OTel Logs API, and updates DB attribute names to stable semantic conventions.

- [ ] **Step 1: Update drizzle-logger.ts — replace span events with log records**

Replace the full contents of `packages/core/src/telemetry/drizzle-logger.ts`:

```typescript
import { logs, SeverityNumber, context, trace } from '@opentelemetry/api';
import type { Logger as DrizzleLogger } from 'drizzle-orm';

const LOGGER_NAME = 'paperless-ngx-dedupe.db';

/**
 * Drizzle ORM logger that emits OTel log records for DB queries.
 *
 * Uses the Logs API instead of deprecated Span.addEvent() — log records
 * are correlated with the active span via context automatically.
 * Zero overhead when no LoggerProvider is registered.
 */
export class OtelDrizzleLogger implements DrizzleLogger {
  private readonly otelLogger = logs.getLogger(LOGGER_NAME);

  logQuery(query: string, _params: unknown[]): void {
    // Skip if no active span — avoids emitting orphaned log records
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan || !activeSpan.isRecording()) return;

    const operation = query.trimStart().split(/\s/)[0]?.toUpperCase() ?? 'UNKNOWN';

    this.otelLogger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'db.query',
      context: context.active(),
      attributes: {
        'db.system.name': 'sqlite',
        'db.operation.name': operation,
        'db.query.text': query.length > 200 ? query.slice(0, 200) + '...' : query,
      },
    });
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm --filter @paperless-dedupe/core build`
Expected: Clean compilation with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/telemetry/drizzle-logger.ts
git commit -m "refactor(telemetry): migrate drizzle logger to log-based events and stable DB semconv

Replace deprecated Span.addEvent() with OTel Logs API emit().
Migrate attributes: db.system → db.system.name, db.operation → db.operation.name,
db.statement → db.query.text (stable semantic conventions)."
```

---

### Task 2: Migrate spans.ts — Replace recordException with Log-Based Events

**Files:**
- Modify: `packages/core/src/telemetry/spans.ts` (lines 24-25 and 47-48)

Replace the deprecated `span.recordException()` calls with log records emitted via the OTel Logs API.

- [ ] **Step 1: Update spans.ts — replace recordException with log records**

Replace the full contents of `packages/core/src/telemetry/spans.ts`:

```typescript
import { trace, SpanStatusCode, logs, SeverityNumber, context, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'paperless-ngx-dedupe';
const LOGGER_NAME = 'paperless-ngx-dedupe.exceptions';

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

const otelLogger = logs.getLogger(LOGGER_NAME);

/**
 * Emit an exception as a log record correlated with the active span.
 * Replaces deprecated Span.recordException() per OTel March 2026 guidance.
 */
function emitExceptionLog(error: Error): void {
  otelLogger.emit({
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: error.message,
    context: context.active(),
    attributes: {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    },
  });
}

/**
 * Wraps an async function in an OpenTelemetry span with automatic error recording.
 * When no SDK is registered, the OTEL API returns no-op spans (zero overhead).
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      emitExceptionLog(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Wraps a synchronous function in an OpenTelemetry span.
 */
export function withSpanSync<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => T,
): T {
  return getTracer().startActiveSpan(name, { attributes }, (span) => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      emitExceptionLog(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm --filter @paperless-dedupe/core build`
Expected: Clean compilation with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/telemetry/spans.ts
git commit -m "refactor(telemetry): replace span.recordException with log-based exception events

Migrate from deprecated Span.recordException() to OTel Logs API with
exception.type, exception.message, exception.stacktrace attributes.
Log records are correlated with the active span via context."
```

---

### Task 3: Migrate Metric Instruments — Add Units

**Files:**
- Modify: `packages/core/src/telemetry/metrics.ts` (add `unit` to all instruments missing it)

Add `unit` property to all metric instruments that don't already have one. Histograms already have `unit: 's'`. Counters need units.

- [ ] **Step 1: Add units to all counter instruments**

In `packages/core/src/telemetry/metrics.ts`, add `unit` to each counter creation call. The histograms already have `unit: 's'` so they're fine.

Edit `syncDocumentsTotal()` (line 14-18):
```typescript
  return (_syncDocumentsTotal ??= getMeter().createCounter(
    'paperless_ngx_dedupe.sync.documents_total',
    {
      description: 'Total documents processed during sync operations',
      unit: '{document}',
    },
  ));
```

Edit `syncRunsTotal()` (line 23-25):
```typescript
  return (_syncRunsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.sync.runs_total', {
    description: 'Total sync runs',
    unit: '{run}',
  }));
```

Edit `analysisRunsTotal()` (line 30-35):
```typescript
  return (_analysisRunsTotal ??= getMeter().createCounter(
    'paperless_ngx_dedupe.analysis.runs_total',
    {
      description: 'Total analysis runs',
      unit: '{run}',
    },
  ));
```

Edit `jobsTotal()` (line 40-42):
```typescript
  return (_jobsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.jobs_total', {
    description: 'Total jobs by type and outcome',
    unit: '{job}',
  }));
```

Edit `paperlessRequestsTotal()` (line 47-52):
```typescript
  return (_paperlessRequestsTotal ??= getMeter().createCounter(
    'paperless_ngx_dedupe.paperless.requests_total',
    {
      description: 'Total HTTP requests to Paperless-NGX API',
      unit: '{request}',
    },
  ));
```

Edit `aiDocumentsTotal()` (line 94-99):
```typescript
  return (_aiDocumentsTotal ??= getMeter().createCounter(
    'paperless_ngx_dedupe.ai.documents_total',
    {
      description: 'Total documents processed by AI, by outcome and provider',
      unit: '{document}',
    },
  ));
```

Edit `aiTokensTotal()` (line 104-106):
```typescript
  return (_aiTokensTotal ??= getMeter().createCounter('paperless_ngx_dedupe.ai.tokens_total', {
    description: 'Total AI tokens consumed, by type and provider',
    unit: '{token}',
  }));
```

Edit `aiRunsTotal()` (line 111-113):
```typescript
  return (_aiRunsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.ai.runs_total', {
    description: 'Total AI batch runs',
    unit: '{run}',
  }));
```

Edit `aiApplyTotal()` (line 118-120):
```typescript
  return (_aiApplyTotal ??= getMeter().createCounter('paperless_ngx_dedupe.ai.apply_total', {
    description: 'Total AI results applied or rejected',
    unit: '{result}',
  }));
```

Add `unit` to the observable gauges in `registerObservableGauges()`:

`documents_count` gauge:
```typescript
  meter
    .createObservableGauge('paperless_ngx_dedupe.documents_count', {
      description: 'Total number of synced documents',
      unit: '{document}',
    })
```

`unresolved_count` gauge:
```typescript
  meter
    .createObservableGauge('paperless_ngx_dedupe.duplicates.unresolved_count', {
      description: 'Number of unresolved duplicate groups',
      unit: '{group}',
    })
```

`active_count` gauge:
```typescript
  meter
    .createObservableGauge('paperless_ngx_dedupe.jobs.active_count', {
      description: 'Number of currently running jobs',
      unit: '{job}',
    })
```

`pending_count` gauge:
```typescript
  meter
    .createObservableGauge('paperless_ngx_dedupe.ai.pending_count', {
      description: 'Number of AI results pending review',
      unit: '{result}',
    })
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm --filter @paperless-dedupe/core build`
Expected: Clean compilation with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/telemetry/metrics.ts
git commit -m "refactor(telemetry): add unit annotations to all metric instruments

Add OTel-standard units: {document}, {run}, {job}, {request}, {token},
{result}, {group} to counters and observable gauges. Histograms already
had unit: 's'."
```

---

### Task 4: Migrate AI Batch — GenAI Semantic Conventions

**Files:**
- Modify: `packages/core/src/ai/batch.ts` (lines 72-78, 162, 202, 333-348, 394, 460-465)

Migrate span attributes and metric labels from custom `ai.*` to OTel GenAI semantic conventions.

- [ ] **Step 1: Update span attributes in the withSpan call (line 72-78)**

Replace:
```typescript
    {
      'ai.provider': provider.provider,
      'ai.model': config.model,
      'ai.reprocess': reprocess,
      'ai.batch_size': maxConcurrency,
      'ai.target_rpm': targetRpm,
    },
```

With:
```typescript
    {
      'gen_ai.system': provider.provider,
      'gen_ai.request.model': config.model,
      'app.ai.reprocess': reprocess,
      'gen_ai.request.batch_size': maxConcurrency,
      'gen_ai.request.target_rpm': targetRpm,
    },
```

- [ ] **Step 2: Update the total_documents attribute (line 162)**

Replace:
```typescript
      span.setAttribute('ai.total_documents', totalDocs);
```

With:
```typescript
      span.setAttribute('app.ai.total_documents', totalDocs);
```

- [ ] **Step 3: Update skipped document metric labels (line 202)**

Replace:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'skipped', provider: provider.provider });
```

With:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'skipped', 'gen_ai.system': provider.provider });
```

- [ ] **Step 4: Update success metric labels (lines 333-348)**

Replace:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'succeeded', provider: provider.provider });
          aiDocumentDuration().record(docDurationMs / 1000, { provider: provider.provider });
          aiTokensTotal().add(extraction.usage.promptTokens, {
            type: 'prompt',
            provider: provider.provider,
          });
          aiTokensTotal().add(extraction.usage.completionTokens, {
            type: 'completion',
            provider: provider.provider,
          });
          if (extraction.usage.cachedTokens) {
            aiTokensTotal().add(extraction.usage.cachedTokens, {
              type: 'cached',
              provider: provider.provider,
            });
          }
```

With:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'succeeded', 'gen_ai.system': provider.provider });
          aiDocumentDuration().record(docDurationMs / 1000, { 'gen_ai.system': provider.provider });
          aiTokensTotal().add(extraction.usage.promptTokens, {
            'gen_ai.token.type': 'input',
            'gen_ai.system': provider.provider,
          });
          aiTokensTotal().add(extraction.usage.completionTokens, {
            'gen_ai.token.type': 'output',
            'gen_ai.system': provider.provider,
          });
          if (extraction.usage.cachedTokens) {
            aiTokensTotal().add(extraction.usage.cachedTokens, {
              'gen_ai.token.type': 'cached',
              'gen_ai.system': provider.provider,
            });
          }
```

- [ ] **Step 5: Update failure metric label (line 394)**

Replace:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'failed', provider: provider.provider });
```

With:
```typescript
          aiDocumentsTotal().add(1, { outcome: 'failed', 'gen_ai.system': provider.provider });
```

- [ ] **Step 6: Update batch result span attributes (lines 460-465)**

Replace:
```typescript
      span.setAttributes({
        'batch.succeeded': result.succeeded,
        'batch.failed': result.failed,
        'batch.skipped': result.skipped,
        'batch.circuit_breaker': circuitBroken,
      });
```

With:
```typescript
      span.setAttributes({
        'app.batch.succeeded': result.succeeded,
        'app.batch.failed': result.failed,
        'app.batch.skipped': result.skipped,
        'app.batch.circuit_breaker': circuitBroken,
      });
```

- [ ] **Step 7: Verify the build compiles**

Run: `pnpm --filter @paperless-dedupe/core build`
Expected: Clean compilation with no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ai/batch.ts
git commit -m "refactor(telemetry): migrate AI batch to GenAI semantic conventions

Rename attributes: ai.provider → gen_ai.system, ai.model → gen_ai.request.model,
token type prompt/completion → input/output. Prefix app-specific attributes with app.*."
```

---

### Task 5: Migrate Worker Entry — Job Attribute + Resource Detectors + Service Namespace + Compression

**Files:**
- Modify: `packages/core/src/jobs/worker-entry.ts` (line 92)
- Modify: `packages/web/telemetry.cjs` (lines 72-82 resource block + new resource detectors)
- Modify: `packages/core/src/config.ts` (add `PYROSCOPE_*` and `OTEL_SERVICE_NAMESPACE` env vars)

This task bundles three related foundation changes: the `job.id` → `app.job.id` rename, the `telemetry.cjs` resource enhancements (detectors, namespace, compression), and config schema additions.

- [ ] **Step 1: Rename job.id attribute in worker-entry.ts (line 92)**

Replace:
```typescript
      await withSpan('dedupe.worker.task', { 'job.id': jobId }, async () => {
```

With:
```typescript
      await withSpan('dedupe.worker.task', { 'app.job.id': jobId }, async () => {
```

- [ ] **Step 2: Add service.namespace and resource detectors to telemetry.cjs**

In `packages/web/telemetry.cjs`, update the resource block (lines 72-79) to add `service.namespace`:

Replace:
```javascript
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-dedupe',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    'deployment.environment':
      process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
    'service.instance.id':
      process.env.OTEL_SERVICE_INSTANCE_ID || process.env.HOSTNAME || randomUUID(),
  }),
  metricReaders,
  instrumentations,
});
```

With:
```javascript
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-dedupe',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    'service.namespace': process.env.OTEL_SERVICE_NAMESPACE || 'paperless-dedupe',
    'deployment.environment':
      process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
    'service.instance.id':
      process.env.OTEL_SERVICE_INSTANCE_ID || process.env.HOSTNAME || randomUUID(),
  }),
  // Resource detectors: env vars, host, OS, process info, container ID (Docker)
  resourceDetectors: [
    require('@opentelemetry/resources').envDetector,
    require('@opentelemetry/resources').hostDetector,
    require('@opentelemetry/resources').osDetector,
    require('@opentelemetry/resources').processDetector,
  ],
  metricReaders,
  instrumentations,
});
```

- [ ] **Step 3: Also add service.namespace to the worker SDK in worker.ts**

In `packages/core/src/telemetry/worker.ts`, update the worker resource block (lines 24-34):

Replace:
```typescript
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-ngx-dedupe',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      'deployment.environment':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
      'service.instance.id':
        process.env.OTEL_SERVICE_INSTANCE_ID || process.env.HOSTNAME || randomUUID(),
      'worker.name': workerName,
      'worker.type': 'worker_thread',
    }),
```

With:
```typescript
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-ngx-dedupe',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      'service.namespace': process.env.OTEL_SERVICE_NAMESPACE || 'paperless-dedupe',
      'deployment.environment':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
      'service.instance.id':
        process.env.OTEL_SERVICE_INSTANCE_ID || process.env.HOSTNAME || randomUUID(),
      'worker.name': workerName,
      'worker.type': 'worker_thread',
    }),
```

- [ ] **Step 4: Add Pyroscope env vars to config.ts**

In `packages/core/src/config.ts`, add the Pyroscope configuration fields to the Zod schema. Add these fields before the closing `})` of the `z.object({...})` (before line 37's `.refine()`):

```typescript
    PYROSCOPE_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    PYROSCOPE_SERVER_ADDRESS: z.string().optional(),
    PYROSCOPE_BASIC_AUTH_USER: z.string().optional(),
    PYROSCOPE_BASIC_AUTH_PASSWORD: z.string().optional(),
    OTEL_SERVICE_NAMESPACE: z.string().default('paperless-dedupe'),
```

Add a refinement for Pyroscope (after the existing FARO refinement, before the `;` on line 58):

```typescript
  .refine((data) => !data.PYROSCOPE_ENABLED || data.PYROSCOPE_SERVER_ADDRESS, {
    error: 'When PYROSCOPE_ENABLED=true, PYROSCOPE_SERVER_ADDRESS is required',
    path: ['PYROSCOPE_ENABLED'],
  })
```

- [ ] **Step 5: Verify the full build compiles**

Run: `pnpm build`
Expected: Clean compilation with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/jobs/worker-entry.ts packages/web/telemetry.cjs packages/core/src/telemetry/worker.ts packages/core/src/config.ts
git commit -m "feat(telemetry): add service.namespace, resource detectors, and Pyroscope config

- Rename job.id → app.job.id span attribute
- Add service.namespace resource attribute to main SDK and workers
- Add env/host/os/process resource detectors to main SDK
- Add PYROSCOPE_* and OTEL_SERVICE_NAMESPACE to Zod config schema"
```

---

## Layer 2: Correlation — End-to-End Tracing

### Task 6: Wire Up Faro TracingInstrumentation + Service Namespace

**Files:**
- Modify: `packages/web/src/lib/faro.ts` (lines 9-27)
- Modify: `packages/web/src/hooks.server.ts` (line 72, CORS headers)

**Depends on:** Task 5 (service.namespace must be in config schema)

- [ ] **Step 1: Update faro.ts — add propagateTraceHeaderCorsUrls and app.namespace**

Replace the full contents of `packages/web/src/lib/faro.ts`:

```typescript
import { faro, getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

export { faro };

export function initFaro(collectorUrl: string, serviceNamespace?: string) {
  if (typeof window === 'undefined' || faro.api) return;

  initializeFaro({
    url: collectorUrl,
    app: {
      name: 'paperless-dedupe',
      version: '0.10.0',
      environment: import.meta.env.MODE,
      namespace: serviceNamespace || 'paperless-dedupe',
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        instrumentationOptions: {
          propagateTraceHeaderCorsUrls: [
            // Match the app's own API routes (same-origin and any configured CORS origin)
            new RegExp(`${window.location.origin}/api/.*`),
          ],
        },
      }),
    ],
    ignoreErrors: [
      /^ResizeObserver loop limit exceeded$/,
      /^ResizeObserver loop completed with undelivered notifications$/,
      /^Script error\.$/,
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    experimental: {
      trackNavigation: true,
    },
  });
}
```

- [ ] **Step 2: Update CORS headers to allow trace headers**

In `packages/web/src/hooks.server.ts`, line 72, update the `Access-Control-Allow-Headers`:

Replace:
```typescript
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
```

With:
```typescript
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, tracestate',
```

- [ ] **Step 3: Update the caller that passes collectorUrl to initFaro**

Search for where `initFaro` is called and add the namespace parameter. Find the call site:

Run: `grep -rn "initFaro(" packages/web/src/ --include="*.ts" --include="*.svelte"`

Update the call site to pass the service namespace from the config. The call likely receives `collectorUrl` from the server config — add `serviceNamespace` alongside it. The exact change depends on the call site found, but the pattern is:

```typescript
// Before:
initFaro(collectorUrl);
// After:
initFaro(collectorUrl, serviceNamespace);
```

Where `serviceNamespace` comes from the server-side config (`config.OTEL_SERVICE_NAMESPACE`).

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm build`
Expected: Clean compilation with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/faro.ts packages/web/src/hooks.server.ts
git commit -m "feat(telemetry): wire Faro TracingInstrumentation for end-to-end trace correlation

- Add propagateTraceHeaderCorsUrls to inject traceparent/tracestate into API fetches
- Add app.namespace for Grafana Cloud App O11y grouping
- Allow traceparent/tracestate in CORS Access-Control-Allow-Headers"
```

---

## Layer 3: New Capabilities

### Task 7: Add Pyroscope Continuous Profiling

**Files:**
- Modify: `packages/web/telemetry.cjs` (add Pyroscope initialization block)
- Create: `packages/core/src/telemetry/pyroscope.ts` (label wrapper helper)
- Modify: `packages/core/src/telemetry/index.ts` (export new helper)

**Depends on:** Task 5 (Pyroscope env vars must be in config schema)

- [ ] **Step 1: Create the Pyroscope label wrapper in core**

Create `packages/core/src/telemetry/pyroscope.ts`:

```typescript
/**
 * Pyroscope label wrapper — adds profiling labels to code paths for
 * flame graph filtering. No-ops gracefully when Pyroscope is not initialized.
 *
 * Initialization happens in telemetry.cjs (web package) which sets
 * globalThis.__pyroscopeModule. This helper picks it up at import time
 * so core code can tag hot code paths without a direct dependency.
 */

type PyroscopeModule = {
  wrapWithLabels: (labels: Record<string, string>, fn: () => void) => void;
};

const pyroscope: PyroscopeModule | null =
  (typeof globalThis !== 'undefined' &&
    ((globalThis as Record<string, unknown>).__pyroscopeModule as PyroscopeModule | undefined)) ??
  null;

/**
 * Wrap a function with Pyroscope labels for flame graph filtering.
 * No-ops when Pyroscope is not initialized (zero overhead).
 */
export function withPyroscopeLabels<T>(labels: Record<string, string>, fn: () => T): T {
  if (!pyroscope) return fn();
  let result: T;
  pyroscope.wrapWithLabels(labels, () => {
    result = fn();
  });
  return result!;
}
```

- [ ] **Step 2: Export the helper from telemetry index**

In `packages/core/src/telemetry/index.ts`, add at the end (before the blank line):

```typescript
// Pyroscope profiling labels
export { withPyroscopeLabels } from './pyroscope.js';
```

- [ ] **Step 3: Add Pyroscope initialization to telemetry.cjs**

In `packages/web/telemetry.cjs`, add a Pyroscope initialization block **after** the SDK start (after `sdk.start();` on line 84, before the `if (otelEnabled)` block on line 86):

```javascript
// --- Pyroscope continuous profiling (opt-in) ---
if (process.env.PYROSCOPE_ENABLED === 'true' && process.env.PYROSCOPE_SERVER_ADDRESS) {
  try {
    const Pyroscope = require('@pyroscope/nodejs');

    Pyroscope.init({
      serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS,
      appName: process.env.OTEL_SERVICE_NAME || 'paperless-dedupe',
      tags: {
        'service.namespace': process.env.OTEL_SERVICE_NAMESPACE || 'paperless-dedupe',
        'deployment.environment':
          process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
      },
      basicAuthUser: process.env.PYROSCOPE_BASIC_AUTH_USER || '',
      basicAuthPassword: process.env.PYROSCOPE_BASIC_AUTH_PASSWORD || '',
      wall: { collectCpuTime: true },
    });

    Pyroscope.start();

    // Make Pyroscope available to core's withPyroscopeLabels() helper
    globalThis.__pyroscopeModule = Pyroscope;
  } catch (err) {
    console.warn('Failed to initialize Pyroscope:', err.message);
  }
}
```

- [ ] **Step 4: Install the @pyroscope/nodejs dependency**

Run: `cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/web add @pyroscope/nodejs`

Note: this goes in the web package because `telemetry.cjs` lives there and is the only file that directly `require()`s it. The core package accesses it via the globalThis bridge.

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm build`
Expected: Clean compilation with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/telemetry/pyroscope.ts packages/core/src/telemetry/index.ts packages/web/telemetry.cjs packages/web/package.json pnpm-lock.yaml
git commit -m "feat(telemetry): add Pyroscope continuous profiling support

Opt-in via PYROSCOPE_ENABLED=true. Captures wall-time (with CPU time)
and heap profiles. Labels available via withPyroscopeLabels() for
flame graph filtering by operation type."
```

---

### Task 8: Add Pyroscope Labels to Hot Code Paths

**Files:**
- Modify: `packages/core/src/sync/sync-documents.ts` (wrap syncDocuments body)
- Modify: `packages/core/src/dedup/analyze.ts` (wrap runAnalysis body)
- Modify: `packages/core/src/ai/batch.ts` (wrap processBatch body)
- Modify: `packages/core/src/jobs/worker-entry.ts` (wrap worker task execution)

**Depends on:** Task 7 (Pyroscope helper must exist)

- [ ] **Step 1: Add Pyroscope label to sync-documents.ts**

In `packages/core/src/sync/sync-documents.ts`, add import at the top (after line 8):

```typescript
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
```

Then wrap the body of `syncDocuments` by changing line 24 (`const logger = createLogger('sync');`) through to the return. The simplest approach: wrap the entire function body inside `withPyroscopeLabels`:

After line 23 (the opening `{` of `syncDocuments`), add:
```typescript
  return withPyroscopeLabels({ operation: 'sync' }, () => {
```

Before the final `return result;` on line 182, close the wrapper. The return is already there — adjust the closing to:
```typescript
  return result;
  });
```

This wraps the entire sync operation in a Pyroscope label.

Actually, a cleaner approach: wrap the entire function body:

At the start of `syncDocuments` (line 23, after the opening brace), the first line is `const logger = createLogger('sync');`. Insert the label wrapper around the whole function content. Since it's a large function, the simplest approach is:

Replace line 23-24:
```typescript
): Promise<SyncResult> {
  const logger = createLogger('sync');
```

With:
```typescript
): Promise<SyncResult> {
  return withPyroscopeLabels({ operation: 'sync' }, async () => {
  const logger = createLogger('sync');
```

And at the very end of the function, before the closing `}`, change:
```typescript
  return result;
}
```

To:
```typescript
  return result;
  });
}
```

- [ ] **Step 2: Add Pyroscope label to analyze.ts**

In `packages/core/src/dedup/analyze.ts`, add import (after line 20):

```typescript
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
```

Wrap the `runAnalysis` function body the same way — after the opening brace, wrap with `withPyroscopeLabels({ operation: 'analysis' }, async () => {` and close before the final `}`.

- [ ] **Step 3: Add Pyroscope label to batch.ts**

In `packages/core/src/ai/batch.ts`, add import (after line 9):

```typescript
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
```

Wrap the `processBatch` function body:

Replace line 61-62:
```typescript
): Promise<AiBatchResult> {
  const { provider, client, config, reprocess = false, documentIds, onProgress } = options;
```

With:
```typescript
): Promise<AiBatchResult> {
  return withPyroscopeLabels({ operation: 'ai_batch' }, async () => {
  const { provider, client, config, reprocess = false, documentIds, onProgress } = options;
```

And close before the final `}` of `processBatch`.

- [ ] **Step 4: Add Pyroscope label to worker-entry.ts**

In `packages/core/src/jobs/worker-entry.ts`, add import (after line 13):

```typescript
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
```

Wrap the task function call inside the `context.with` block (line 91-94):

Replace:
```typescript
    await context.with(parentContext, async () => {
      await withSpan('dedupe.worker.task', { 'app.job.id': jobId }, async () => {
        const result = await taskFn({ db, sqlite, jobId, taskData }, onProgress);
        completeJob(db, jobId, result);
        logger.info({ jobId }, 'Worker task completed successfully');
      });
    });
```

With:
```typescript
    await context.with(parentContext, async () => {
      await withPyroscopeLabels({ operation: 'worker' }, async () => {
        await withSpan('dedupe.worker.task', { 'app.job.id': jobId }, async () => {
          const result = await taskFn({ db, sqlite, jobId, taskData }, onProgress);
          completeJob(db, jobId, result);
          logger.info({ jobId }, 'Worker task completed successfully');
        });
      });
    });
```

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm build`
Expected: Clean compilation with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/sync-documents.ts packages/core/src/dedup/analyze.ts packages/core/src/ai/batch.ts packages/core/src/jobs/worker-entry.ts
git commit -m "feat(telemetry): add Pyroscope operation labels to hot code paths

Label sync, analysis, ai_batch, and worker operations for flame graph
filtering in Grafana Pyroscope."
```

---

## Task 9: Documentation & .env.example Updates

**Files:**
- Modify: `.env.example` (add new env vars)
- Modify: `docs/configuration.md` (add Pyroscope section, update observability section)
- Create: `docs/observability.md` (Alloy config guide, Grafana Cloud setup, dashboard guidance)

**Depends on:** All other tasks (references their changes)

- [ ] **Step 1: Update .env.example — add new env vars**

Add after the FARO section (after line 57) and before the OTEL section:

```bash
# --- Pyroscope Continuous Profiling (optional, disabled by default) ---
#
# Captures wall-time and heap profiles from the Node.js runtime.
# Sends to Grafana Cloud Pyroscope or a self-hosted Pyroscope server.
# Use operation labels (sync, analysis, ai_batch, worker) to filter
# flame graphs by code path.

# Enable continuous profiling
# PYROSCOPE_ENABLED=false

# Pyroscope server endpoint (required when PYROSCOPE_ENABLED=true)
# For Grafana Cloud: https://profiles-prod-xxx.grafana.net
# PYROSCOPE_SERVER_ADDRESS=

# Grafana Cloud authentication (required for Grafana Cloud Pyroscope)
# PYROSCOPE_BASIC_AUTH_USER=<instance-id>
# PYROSCOPE_BASIC_AUTH_PASSWORD=<api-key>
```

Add after the `OTEL_SERVICE_NAME` line (line 78):

```bash
# Logical namespace grouping frontend and backend in Grafana Cloud App Observability
# OTEL_SERVICE_NAMESPACE=paperless-dedupe
```

Add after the `OTEL_EXPORTER_OTLP_HEADERS` line (line 111):

```bash
# Enable gzip compression for OTLP exports (recommended for Grafana Cloud)
# OTEL_EXPORTER_OTLP_COMPRESSION=gzip
```

Add after the `OTEL_DEPLOYMENT_ENVIRONMENT` line (line 129):

```bash
# Opt into stable database semantic conventions (recommended)
# OTEL_SEMCONV_STABILITY_OPT_IN=database
```

- [ ] **Step 2: Update docs/configuration.md — add Pyroscope and OTLP compression sections**

In `docs/configuration.md`, after the Observability section (after "See `.env.example` for the full list." on line 75), add:

```markdown

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

Profiles are labeled by operation (`sync`, `analysis`, `ai_batch`, `worker`) for flame graph filtering.
```

- [ ] **Step 3: Create docs/observability.md ��� Grafana Cloud setup guide**

Create `docs/observability.md` with content covering:

```markdown
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
```

- [ ] **Step 4: Verify docs build (if applicable)**

Run: `ls docs/` to confirm file is in place.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/configuration.md docs/observability.md
git commit -m "docs: add observability guide, Pyroscope setup, and updated env vars

- New docs/observability.md with Grafana Cloud setup, Alloy config,
  exemplars guide, Pyroscope flame graphs, and semantic conventions
- Updated .env.example with all new env vars
- Updated docs/configuration.md with Pyroscope and OTLP sections"
```

---

## Final Verification

### Task 10: Full Build + Lint + Type Check

**Depends on:** All tasks 1-9

- [ ] **Step 1: Run the full verification suite**

```bash
pnpm lint && pnpm format && pnpm check && pnpm test
```

Expected: All pass with no errors.

- [ ] **Step 2: Run the full build**

```bash
pnpm build
```

Expected: Clean build of core → web with no errors.

- [ ] **Step 3: If any failures, fix and commit the fixes**

Address any lint, type, or test failures introduced by the changes.
