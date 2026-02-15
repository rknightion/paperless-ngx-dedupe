'use strict';

// OpenTelemetry preload script — loaded via `node --require ./telemetry.cjs build`
// Must run before any application code to patch http, undici, and pino modules.
//
// Supports two modes:
//   OTEL_ENABLED=true           — Full observability: traces, metrics, log correlation, auto-instrumentation
//   OTEL_PROMETHEUS_ENABLED=true — Metrics-only: just the /api/v1/metrics Prometheus scrape endpoint
//
// When neither is set, this script exits immediately with zero overhead.

const otelEnabled = process.env.OTEL_ENABLED === 'true';
const prometheusEnabled = process.env.OTEL_PROMETHEUS_ENABLED === 'true';

if (!otelEnabled && !prometheusEnabled) {
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const metricReaders = [];
const instrumentations = [];
let traceExporter;

// --- Full OTEL mode: traces + OTLP metrics + auto-instrumentation ---
if (otelEnabled) {
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

  traceExporter = new OTLPTraceExporter();

  metricReaders.push(
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10),
    }),
  );

  instrumentations.push(
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/api/v1/health', '/api/v1/ready', '/api/v1/metrics'],
      },
      '@opentelemetry/instrumentation-fs': {
        requireParentSpan: true,
      },
      '@opentelemetry/instrumentation-pino': {},
    }),
  );
}

// --- Prometheus scrape endpoint (works standalone or alongside full OTEL) ---
if (prometheusEnabled) {
  try {
    const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
    const prometheusExporter = new PrometheusExporter({ preventServerStart: true });
    metricReaders.push(prometheusExporter);
    globalThis.__otelPrometheusExporter = prometheusExporter;
  } catch (err) {
    console.warn('Failed to load Prometheus exporter:', err.message);
  }
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-dedupe',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
  }),
  traceExporter,
  metricReader: metricReaders.length === 1 ? metricReaders[0] : undefined,
  metricReaders: metricReaders.length > 1 ? metricReaders : undefined,
  instrumentations,
});

sdk.start();
globalThis.__otelSdk = sdk;

// Flush telemetry on shutdown (cooperates with the app's 25s safety net)
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
  } catch {
    // Best-effort flush
  }
});
