'use strict';

// OpenTelemetry preload script — loaded via `node --require ./telemetry.cjs build`
// Must run before any application code to patch http, undici, and pino modules.
//
// Exporters are configured entirely via standard OTEL env vars:
//   OTEL_TRACES_EXPORTER   — otlp (default), console, or none
//   OTEL_METRICS_EXPORTER   — otlp (default), console, or none
//   OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL, etc.
//
// Set OTEL_PROMETHEUS_ENABLED=true to expose a /api/v1/metrics scrape endpoint.
// Can be used standalone or alongside OTEL_ENABLED=true.

const otelEnabled = process.env.OTEL_ENABLED === 'true';
const prometheusEnabled = process.env.OTEL_PROMETHEUS_ENABLED === 'true';

if (!otelEnabled && !prometheusEnabled) {
  return;
}

const { randomUUID } = require('node:crypto');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const metricReaders = [];

if (prometheusEnabled) {
  const {
    PrometheusExporter,
    PrometheusSerializer,
  } = require('@opentelemetry/exporter-prometheus');
  const exporter = new PrometheusExporter({ preventServerStart: true });
  const serializer = new PrometheusSerializer();
  metricReaders.push(exporter);

  globalThis.__otelPrometheusCollect = async () => {
    const { resourceMetrics, errors } = await exporter.collect();
    if (errors.length) {
      console.warn('Prometheus metrics collection errors:', ...errors);
    }
    return serializer.serialize(resourceMetrics);
  };
}

const instrumentations = otelEnabled
  ? [
      require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) =>
            req.url === '/api/v1/health' ||
            req.url === '/api/v1/ready' ||
            req.url === '/api/v1/metrics',
        },
        '@opentelemetry/instrumentation-fs': {
          requireParentSpan: true,
        },
        '@opentelemetry/instrumentation-pino': {
          // Trace correlation fields (trace_id, span_id) are handled by the
          // explicit mixin in logger.ts. Keep enabled here as a secondary path.
          disableLogCorrelation: false,
          // Pipes pino records → OTEL Logs SDK → OTLP exporter.
          // Controlled by OTEL_LOGS_EXPORTER env var (default: otlp).
          // Set OTEL_LOGS_EXPORTER=none to disable.
          disableLogSending: false,
        },
      }),
    ]
  : [];

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
  // Resource detectors: env vars, host, OS, process info
  resourceDetectors: [
    require('@opentelemetry/resources').envDetector,
    require('@opentelemetry/resources').hostDetector,
    require('@opentelemetry/resources').osDetector,
    require('@opentelemetry/resources').processDetector,
  ],
  metricReaders,
  instrumentations,
});

sdk.start();

if (otelEnabled) {
  // Force RITM hooks to fire for built-in modules that were loaded during SDK
  // initialization (before hooks were registered). The SDK transitively requires
  // http/https via its OTLP exporter deps, caching them before instrumentation
  // hooks are set up. Re-requiring them triggers the patched Module.prototype.require,
  // which calls instrumentation-http's onRequire → wraps http.Server.prototype.emit
  // for incoming request spans. The prototype mutation persists for ESM imports too.
  require('http');
  require('https');
}

globalThis.__otelSdk = sdk;

// Flush telemetry on shutdown (cooperates with the app's 25s safety net)
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
  } catch {
    // Best-effort flush
  }
});
