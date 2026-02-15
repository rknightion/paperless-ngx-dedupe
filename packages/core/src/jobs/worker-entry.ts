import { workerData } from 'node:worker_threads';
import { context } from '@opentelemetry/api';
import { createDatabase } from '../db/client.js';
import { updateJobProgress, completeJob, failJob, getJob } from './manager.js';
import { createLogger } from '../logger.js';
import {
  initWorkerTelemetry,
  shutdownWorkerTelemetry,
  flushWorkerTelemetry,
  extractTraceContext,
} from '../telemetry/worker.js';
import { withSpan } from '../telemetry/spans.js';
import type { AppDatabase } from '../db/client.js';

export type ProgressCallback = (progress: number, message?: string) => Promise<void>;

export interface WorkerContext {
  db: AppDatabase;
  jobId: string;
  taskData: unknown;
}

export type TaskFunction = (ctx: WorkerContext, onProgress: ProgressCallback) => Promise<unknown>;

export async function runWorkerTask(taskFn: TaskFunction): Promise<void> {
  const { jobId, dbPath, taskData, traceContext } = workerData as {
    jobId: string;
    dbPath: string;
    taskData?: unknown;
    traceContext?: Record<string, string>;
  };

  // Initialize OTEL in this worker thread (no-op if OTEL_ENABLED !== 'true')
  await initWorkerTelemetry(`worker-${jobId.slice(0, 8)}`);

  // Restore parent trace context from the HTTP request that spawned this job
  const parentContext = extractTraceContext(traceContext);

  const logger = createLogger('worker');
  const db = createDatabase(dbPath);

  // Set job to running
  const { job: jobTable } = await import('../schema/sqlite/jobs.js');
  const { eq } = await import('drizzle-orm');

  db.update(jobTable)
    .set({
      status: 'running',
      startedAt: new Date().toISOString(),
    })
    .where(eq(jobTable.id, jobId))
    .run();

  logger.info({ jobId }, 'Worker task started');

  let lastCancelCheck = Date.now();
  let lastFlushTime = Date.now();
  const FLUSH_INTERVAL_MS = 30_000;

  const onProgress: ProgressCallback = async (progress: number, message?: string) => {
    updateJobProgress(db, jobId, progress, message);

    const now = Date.now();

    // Check for cancellation every 2 seconds
    if (now - lastCancelCheck >= 2000) {
      lastCancelCheck = now;
      const currentJob = getJob(db, jobId);
      if (currentJob?.status === 'cancelled') {
        throw new CancellationError('Job was cancelled');
      }
    }

    // Periodic telemetry flush to prevent span/metric accumulation
    if (now - lastFlushTime >= FLUSH_INTERVAL_MS) {
      lastFlushTime = now;
      await flushWorkerTelemetry();
    }
  };

  try {
    // Run task within the parent trace context so spans are linked
    await context.with(parentContext, async () => {
      await withSpan('dedupe.worker.task', { 'job.id': jobId }, async () => {
        const result = await taskFn({ db, jobId, taskData }, onProgress);
        completeJob(db, jobId, result);
        logger.info({ jobId }, 'Worker task completed successfully');
      });
    });
  } catch (error) {
    if (error instanceof CancellationError) {
      logger.info({ jobId }, 'Worker task cancelled');
      return;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    failJob(db, jobId, errorMessage);
    logger.error({ jobId, error: errorMessage }, 'Worker task failed');
  } finally {
    await shutdownWorkerTelemetry();
  }
}

class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationError';
  }
}
