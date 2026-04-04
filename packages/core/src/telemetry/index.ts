// Span helpers
export { getTracer, withSpan, withSpanSync } from './spans.js';

// Metric instruments
export {
  syncDocumentsTotal,
  syncRunsTotal,
  analysisRunsTotal,
  jobsTotal,
  paperlessRequestsTotal,
  syncDuration,
  analysisDuration,
  analysisStageDuration,
  aiDocumentsTotal,
  aiTokensTotal,
  aiRunsTotal,
  aiApplyTotal,
  aiDocumentDuration,
  aiBatchDuration,
  registerObservableGauges,
} from './metrics.js';

// Database instrumentation
export { OtelDrizzleLogger } from './drizzle-logger.js';

// Worker thread telemetry
export {
  initWorkerTelemetry,
  shutdownWorkerTelemetry,
  flushWorkerTelemetry,
  serializeTraceContext,
  extractTraceContext,
} from './worker.js';

// Paperless-NGX system metrics collectors
export { PaperlessMetricsCoordinator, COLLECTOR_IDS } from './paperless-collectors/index.js';
export type { PaperlessMetricsOptions, CollectorId } from './paperless-collectors/index.js';

// Pyroscope profiling labels
export { withPyroscopeLabels } from './pyroscope.js';
