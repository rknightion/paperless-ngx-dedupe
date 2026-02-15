'use strict';

// OpenTelemetry preload script — loaded via `node --require ./telemetry.cjs build`
// Must run before any application code to patch http, undici, and pino modules.
//
// Exporters are configured entirely via standard OTEL env vars:
//   OTEL_TRACES_EXPORTER   — otlp (default), console, or none
//   OTEL_METRICS_EXPORTER   — otlp (default), console, or none
//   OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL, etc.
//
// When OTEL_ENABLED is not 'true', this script exits immediately with zero overhead.

if (process.env.OTEL_ENABLED !== 'true') {
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-dedupe',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/api/v1/health', '/api/v1/ready'],
      },
      '@opentelemetry/instrumentation-fs': {
        requireParentSpan: true,
      },
      '@opentelemetry/instrumentation-pino': {},
    }),
  ],
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
