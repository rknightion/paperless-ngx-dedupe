import { Worker } from 'node:worker_threads';
import { createLogger } from '../logger.js';

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

  const workerData = { jobId, dbPath, taskData };

  // For .ts files (dev mode), add tsx loader
  const execArgv: string[] = [];
  if (workerScriptPath.endsWith('.ts')) {
    execArgv.push('--import', 'tsx/esm');
  }

  const worker = new Worker(workerScriptPath, {
    workerData,
    execArgv,
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

  logger.info({ jobId, workerScriptPath }, 'Worker launched');

  return { jobId, worker, done };
}
