import { context, propagation, ROOT_CONTEXT, type Context } from '@opentelemetry/api';

let workerSdk: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OTEL SDK in a worker thread. Workers run in separate V8 isolates
 * and don't inherit the main thread's SDK.
 */
export async function initWorkerTelemetry(workerName: string): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') return;

  // Dynamic imports to avoid loading heavy SDK packages when telemetry is disabled
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { resourceFromAttributes } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
  const { UndiciInstrumentation } = await import('@opentelemetry/instrumentation-undici');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'paperless-ngx-dedupe',
      'worker.name': workerName,
      'worker.type': 'worker_thread',
    }),
    // No explicit exporters — SDK reads OTEL_TRACES_EXPORTER, OTEL_METRICS_EXPORTER, etc.
    instrumentations: [],
    spanLimits: {
      eventCountLimit: 64,
      attributeCountLimit: 64,
      linkCountLimit: 32,
    },
  });

  sdk.start();
  workerSdk = sdk;
}

/**
 * Force-flush pending telemetry data. Call periodically during long operations
 * to prevent span/metric accumulation. No-op when OTEL is disabled.
 */
export async function flushWorkerTelemetry(): Promise<void> {
  if (!workerSdk) return;
  const provider = trace.getTracerProvider();
  if ('forceFlush' in provider && typeof provider.forceFlush === 'function') {
    await (provider as { forceFlush: () => Promise<void> }).forceFlush();
  }
}

/**
 * Flush pending telemetry and shut down the worker SDK.
 */
export async function shutdownWorkerTelemetry(): Promise<void> {
  if (workerSdk) {
    await workerSdk.shutdown();
    workerSdk = null;
  }
}

/**
 * Serialize the current trace context into a plain object for passing via workerData.
 */
export function serializeTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extract a parent trace context from a serialized carrier (from workerData).
 */
export function extractTraceContext(carrier: Record<string, string> | undefined): Context {
  if (!carrier || Object.keys(carrier).length === 0) return ROOT_CONTEXT;
  return propagation.extract(ROOT_CONTEXT, carrier);
}
