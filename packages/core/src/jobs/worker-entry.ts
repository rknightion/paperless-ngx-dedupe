import { workerData } from 'node:worker_threads';
import { createDatabase } from '../db/client.js';
import { updateJobProgress, completeJob, failJob, getJob } from './manager.js';
import { createLogger } from '../logger.js';
import type { AppDatabase } from '../db/client.js';

export type ProgressCallback = (progress: number, message?: string) => Promise<void>;

export interface WorkerContext {
  db: AppDatabase;
  jobId: string;
  taskData: unknown;
}

export type TaskFunction = (
  ctx: WorkerContext,
  onProgress: ProgressCallback,
) => Promise<unknown>;

export async function runWorkerTask(taskFn: TaskFunction): Promise<void> {
  const { jobId, dbPath, taskData } = workerData as {
    jobId: string;
    dbPath: string;
    taskData?: unknown;
  };

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

  const onProgress: ProgressCallback = async (progress: number, message?: string) => {
    updateJobProgress(db, jobId, progress, message);

    // Check for cancellation every 2 seconds
    const now = Date.now();
    if (now - lastCancelCheck >= 2000) {
      lastCancelCheck = now;
      const currentJob = getJob(db, jobId);
      if (currentJob?.status === 'cancelled') {
        throw new CancellationError('Job was cancelled');
      }
    }
  };

  try {
    const result = await taskFn({ db, jobId, taskData }, onProgress);
    completeJob(db, jobId, result);
    logger.info({ jobId }, 'Worker task completed successfully');
  } catch (error) {
    if (error instanceof CancellationError) {
      logger.info({ jobId }, 'Worker task cancelled');
      // Job is already marked as cancelled, just exit cleanly
      return;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    failJob(db, jobId, errorMessage);
    logger.error({ jobId, error: errorMessage }, 'Worker task failed');
  }
}

class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationError';
  }
}
