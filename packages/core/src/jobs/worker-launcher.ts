import { Worker, type WorkerOptions } from 'node:worker_threads';
import { nanoid } from 'nanoid';
import { createLogger } from '../logger.js';
import { createDatabase, createDatabaseWithHandle } from '../db/client.js';
import { failJob } from './manager.js';
import { releaseWorkerClaimForRetry } from './worker-entry.js';
import { serializeTraceContext } from '../telemetry/worker.js';

export interface LaunchWorkerOptions {
  jobId: string;
  dbPath: string;
  workerScriptPath: string;
  taskData?: unknown;
  createWorker?: (workerScriptPath: string, workerOptions: WorkerOptions) => Worker;
  markJobFailed?: typeof failJob;
}

export interface WorkerHandle {
  jobId: string;
  executionToken: string;
  worker: Worker;
  ready: Promise<{ claimed: boolean }>;
  done: Promise<void>;
  abortBeforeReady(): Promise<void> | undefined;
}

export function launchWorker(options: LaunchWorkerOptions): WorkerHandle {
  const logger = createLogger('worker-launcher');
  const { jobId, dbPath, workerScriptPath, taskData } = options;
  const executionToken = nanoid();

  const traceContext = serializeTraceContext();
  const workerData = { jobId, dbPath, executionToken, taskData, traceContext };

  // Worker threads run outside Vite as raw Node.js processes. In dev mode (.ts files),
  // they fail because Node.js can't resolve the .js extension imports used throughout
  // the codebase (moduleResolution: "bundler" convention). Use Docker for local development.
  // In production, tsc compiles to .js in dist/ and workers load normally.
  const workerOptions: WorkerOptions = {
    workerData,
    execArgv: [], // Prevent inheriting --require ./telemetry.cjs; workers use initWorkerTelemetry()
    resourceLimits: {
      maxOldGenerationSizeMb: 768,
    },
  };
  const worker = options.createWorker
    ? options.createWorker(workerScriptPath, workerOptions)
    : new Worker(workerScriptPath, workerOptions);
  const markJobFailed = options.markJobFailed ?? failJob;

  let readinessAcknowledged = false;
  let executionClaimed = false;
  let abortedBeforeReady = false;
  let abortPromise: Promise<void> | undefined;
  let workerError: Error | undefined;
  let resolveReady!: (value: { claimed: boolean }) => void;
  let rejectReady!: (reason: Error) => void;
  const ready = new Promise<{ claimed: boolean }>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Legacy direct-launch callers do not await readiness. Keep the rejection
  // observed while still exposing it to durable dispatchers.
  void ready.catch(() => undefined);

  worker.on('message', (message: unknown) => {
    if (abortedBeforeReady) return;
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'worker-ready' &&
      'jobId' in message &&
      message.jobId === jobId &&
      'executionToken' in message &&
      message.executionToken === executionToken &&
      'claimed' in message &&
      typeof message.claimed === 'boolean'
    ) {
      readinessAcknowledged = true;
      executionClaimed = message.claimed;
      resolveReady({ claimed: message.claimed });
    }
  });

  const reconcilePreReadyClaim = () => {
    try {
      const { sqlite } = createDatabaseWithHandle(dbPath);
      try {
        releaseWorkerClaimForRetry(sqlite, jobId, executionToken);
      } finally {
        sqlite.close();
      }
    } catch (error) {
      logger.error({ jobId, executionToken, error }, 'Failed to release pre-ready worker claim');
    }
  };

  const done = new Promise<void>((resolve, reject) => {
    worker.on('exit', (code) => {
      if (abortedBeforeReady || !readinessAcknowledged) {
        reconcilePreReadyClaim();
        rejectReady(
          abortedBeforeReady
            ? new Error('Worker aborted before readiness acknowledgement')
            : (workerError ??
                new Error(`Worker exited before readiness acknowledgement with code ${code}`)),
        );
      }
      if (code === 0) {
        logger.info({ jobId }, 'Worker exited successfully');
        resolve();
      } else {
        logger.error({ jobId, exitCode: code }, 'Worker exited with error');
        reject(workerError ?? new Error(`Worker exited with code ${code}`));
      }
    });
    worker.on('error', (err: Error) => {
      workerError = err;
      logger.error({ jobId, error: err.message }, 'Worker error');
    });
  });

  // Mark job as failed if the worker crashes before it can update its own status
  done.catch((err) => {
    if (abortedBeforeReady || !readinessAcknowledged || !executionClaimed) {
      logger.warn(
        { jobId, readinessAcknowledged, executionClaimed },
        'Worker failed without owning execution; leaving durable job unchanged',
      );
      return;
    }
    try {
      const db = createDatabase(dbPath);
      const message = err instanceof Error ? err.message : String(err);
      markJobFailed(db, jobId, `Worker crashed: ${message}`, executionToken);
      logger.info({ jobId }, 'Marked crashed worker job as failed');
    } catch (e) {
      logger.error({ jobId, error: e }, 'Failed to mark crashed job as failed');
    }
  });

  logger.info({ jobId, workerScriptPath }, 'Worker launched');

  const abortBeforeReady = (): Promise<void> | undefined => {
    if (readinessAcknowledged) return undefined;
    if (abortPromise) return abortPromise;

    // This state transition must happen before terminate() can yield or emit.
    abortedBeforeReady = true;
    abortPromise = (async () => {
      try {
        await worker.terminate();
      } catch (error) {
        logger.error({ jobId, error }, 'Failed to terminate unready worker');
      }
      await done.catch(() => undefined);
    })();
    return abortPromise;
  };

  return { jobId, executionToken, worker, ready, done, abortBeforeReady };
}
