import { Worker } from 'node:worker_threads';
import { createLogger } from '../logger.js';
import { createDatabase } from '../db/client.js';
import { failJob } from './manager.js';
import { serializeTraceContext } from '../telemetry/worker.js';

export interface LaunchWorkerOptions {
  jobId: string;
  dbPath: string;
  workerScriptPath: string;
  taskData?: unknown;
}

export interface WorkerHandle {
  jobId: string;
  worker: Worker;
  done: Promise<void>;
}

export function launchWorker(options: LaunchWorkerOptions): WorkerHandle {
  const logger = createLogger('worker-launcher');
  const { jobId, dbPath, workerScriptPath, taskData } = options;

  const traceContext = serializeTraceContext();
  const workerData = { jobId, dbPath, taskData, traceContext };

  // Worker threads run outside Vite as raw Node.js processes. In dev mode (.ts files),
  // they fail because Node.js can't resolve the .js extension imports used throughout
  // the codebase (moduleResolution: "bundler" convention). Use Docker for local development.
  // In production, tsc compiles to .js in dist/ and workers load normally.
  const worker = new Worker(workerScriptPath, {
    workerData,
  });

  const done = new Promise<void>((resolve, reject) => {
    worker.on('exit', (code) => {
      if (code === 0) {
        logger.info({ jobId }, 'Worker exited successfully');
        resolve();
      } else {
        logger.error({ jobId, exitCode: code }, 'Worker exited with error');
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
    worker.on('error', (err: Error) => {
      logger.error({ jobId, error: err.message }, 'Worker error');
      reject(err);
    });
  });

  // Mark job as failed if the worker crashes before it can update its own status
  done.catch((err) => {
    try {
      const db = createDatabase(dbPath);
      const message = err instanceof Error ? err.message : String(err);
      failJob(db, jobId, `Worker crashed: ${message}`);
      logger.info({ jobId }, 'Marked crashed worker job as failed');
    } catch (e) {
      logger.error({ jobId, error: e }, 'Failed to mark crashed job as failed');
    }
  });

  logger.info({ jobId, workerScriptPath }, 'Worker launched');

  return { jobId, worker, done };
}
