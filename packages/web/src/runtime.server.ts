import { building } from '$app/environment';
import {
  createLogger,
  initLogger,
  PaperlessClient,
  PaperlessMetricsCoordinator,
  parseConfig,
  toPaperlessConfig,
} from '@paperless-dedupe/core';

import { getDatabase } from '$lib/server/db';
import { createJobDispatcher } from '$lib/server/job-dispatcher';
import {
  createRuntimeAcceptingGate,
  createRuntime,
  initializeRuntimeOnce,
  startScheduler,
  type ServerRuntime,
} from '$lib/server/scheduler';
import {
  getProcessRuntimeState,
  registerRuntimeShutdownHandlers,
  type ProcessRuntimeState,
} from '$lib/server/runtime-lifecycle';

const SCHEDULER_INTERVAL_MS = 5_000;

function startMetrics(runtime: ServerRuntime): PaperlessMetricsCoordinator | undefined {
  const telemetryActive =
    process.env.OTEL_ENABLED === 'true' || process.env.OTEL_PROMETHEUS_ENABLED === 'true';
  if (!telemetryActive || !runtime.config.PAPERLESS_METRICS_ENABLED) return undefined;

  const client = new PaperlessClient({
    ...toPaperlessConfig(runtime.config),
    timeout: 10_000,
    maxRetries: 0,
  });
  const coordinator = new PaperlessMetricsCoordinator({
    client,
    enabledCollectors: runtime.config.PAPERLESS_METRICS_COLLECTORS
      ? runtime.config.PAPERLESS_METRICS_COLLECTORS.split(',')
          .map((collector) => collector.trim())
          .filter(Boolean)
      : undefined,
  });
  coordinator.start();
  return coordinator;
}

/**
 * Initializes the process runtime once. The global symbol survives dev HMR,
 * while the module-level invocation ensures adapter-node starts evaluation
 * before the first request.
 */
export function initializeServerRuntime(): Promise<ServerRuntime> {
  const runtimeState: ProcessRuntimeState = getProcessRuntimeState();
  return initializeRuntimeOnce(runtimeState, async () => {
    const config = parseConfig(process.env as Record<string, string | undefined>);
    initLogger(config.LOG_LEVEL);
    const logger = createLogger('server-runtime');
    const { db, sqlite } = await getDatabase(config);
    const acceptingGate = createRuntimeAcceptingGate();
    const dispatcher = createJobDispatcher({
      sqlite,
      dbPath: config.DATABASE_URL,
      logger: createLogger('job-dispatcher'),
      acceptingGate,
    });
    const runtime = createRuntime({ config, db, sqlite, logger, dispatcher, acceptingGate });

    runtimeState.scheduler = startScheduler(runtime, SCHEDULER_INTERVAL_MS);
    runtimeState.metrics = startMetrics(runtime);
    registerRuntimeShutdownHandlers(runtimeState, runtime);
    logger.info('Server runtime initialized');
    return runtime;
  });
}

const coldStartRuntime = building ? undefined : initializeServerRuntime();
void coldStartRuntime?.catch(() => undefined);

export function getServerRuntime(): Promise<ServerRuntime> {
  return initializeServerRuntime();
}
