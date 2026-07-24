import {
  getDispatchIntent,
  getWorkerPath,
  launchWorker,
  type Logger,
  type SchedulerDispatchExecutor,
  type WorkerHandle,
  type WorkerName,
} from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRuntimeAcceptingGate, type RuntimeAcceptingGate } from './runtime-gate.js';

type LaunchWorker = typeof launchWorker;
type ResolveWorkerPath = typeof getWorkerPath;

export interface JobDispatcherOptions {
  sqlite: Database.Database;
  dbPath: string;
  logger: Logger;
  acceptingGate?: RuntimeAcceptingGate;
  readinessTimeoutMs?: number;
  launchWorker?: LaunchWorker;
  getWorkerPath?: ResolveWorkerPath;
}

const DEFAULT_READINESS_TIMEOUT_MS = 60_000;
const DISPATCH_CLAIM_DURATION_MS = 5 * 60 * 1000;

const WORKER_BY_TASK = {
  sync: 'sync-worker',
  analysis: 'analysis-worker',
  ai_processing: 'ai-processing-worker',
} as const satisfies Record<string, WorkerName>;

interface WorkerPathOptions {
  cwd?: string;
  exists?: (path: string) => boolean;
  fallback?: ResolveWorkerPath;
}

export function resolveServerWorkerPath(name: WorkerName, options: WorkerPathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const candidates = [
    join(cwd, '..', 'core', 'dist', 'jobs', 'workers', `${name}.js`),
    join(cwd, 'core', 'jobs', 'workers', `${name}.js`),
  ];
  const match = candidates.find((candidate) => exists(candidate));
  return match ?? (options.fallback ?? getWorkerPath)(name);
}

export function createJobDispatcher(options: JobDispatcherOptions): SchedulerDispatchExecutor {
  const launch = options.launchWorker ?? launchWorker;
  const resolveWorkerPath = options.getWorkerPath ?? resolveServerWorkerPath;
  const acceptingGate = options.acceptingGate ?? createRuntimeAcceptingGate();
  const readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const inFlight = new Map<string, Promise<void>>();

  if (readinessTimeoutMs <= 0 || readinessTimeoutMs >= DISPATCH_CLAIM_DURATION_MS) {
    throw new RangeError(
      `Worker readiness timeout must be greater than zero and shorter than ${DISPATCH_CLAIM_DURATION_MS}ms`,
    );
  }

  return {
    sqlite: options.sqlite,

    launchIntent(intentId: string, idempotencyKey: string): Promise<void> {
      try {
        acceptingGate.assertAccepting();
      } catch (error) {
        return Promise.reject(error);
      }
      const existing = inFlight.get(idempotencyKey);
      if (existing) return existing;

      const launching = Promise.resolve().then(async () => {
        acceptingGate.assertAccepting();
        let intent: ReturnType<typeof getDispatchIntent>;
        try {
          intent = getDispatchIntent(options.sqlite, intentId);
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new Error(`Dispatch intent '${intentId}' has invalid persisted task data`, {
              cause: error,
            });
          }
          throw error;
        }
        if (intent.status === 'dispatched') return;
        if (!intent.jobId) throw new Error(`Dispatch intent '${intentId}' has no durable job`);

        const workerName = WORKER_BY_TASK[intent.task as keyof typeof WORKER_BY_TASK];
        if (!workerName) {
          const job = options.sqlite
            .prepare('SELECT status FROM job WHERE id = ?')
            .get(intent.jobId) as { status: string | null } | undefined;
          if (job && job.status !== 'pending') {
            options.logger.info(
              { intentId, jobId: intent.jobId, task: intent.task, jobStatus: job?.status },
              'Legacy direct worker already owns dispatch intent',
            );
            return;
          }
          throw new Error(`Dispatch intent '${intentId}' has unsupported task '${intent.task}'`);
        }

        acceptingGate.assertAccepting();
        const handle: WorkerHandle = launch({
          jobId: intent.jobId,
          dbPath: options.dbPath,
          workerScriptPath: resolveWorkerPath(workerName),
          taskData: intent.taskData,
        });
        handle.done.catch((error: unknown) => {
          options.logger.error({ jobId: intent.jobId, error }, 'Dispatched worker failed');
        });
        await new Promise<{ claimed: boolean }>((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            const aborting = handle.abortBeforeReady();
            if (!aborting) return;
            settled = true;
            void (async () => {
              await aborting;
              reject(
                new Error(
                  `Worker '${intent.jobId}' did not acknowledge readiness within ${readinessTimeoutMs}ms`,
                ),
              );
            })();
          }, readinessTimeoutMs);
          timer.unref();

          handle.ready.then(
            (readiness) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(readiness);
            },
            (error: unknown) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(error);
            },
          );
        }).then((readiness) => {
          if (readiness.claimed) return;

          const durableJob = options.sqlite
            .prepare(
              `SELECT status, execution_token AS executionToken
               FROM job WHERE id = ?`,
            )
            .get(intent.jobId!) as
            { status: string | null; executionToken: string | null } | undefined;
          const terminal = ['completed', 'failed', 'cancelled'].includes(durableJob?.status ?? '');
          const ownedByAnotherLaunch =
            (durableJob?.status === 'running' || durableJob?.status === 'paused') &&
            durableJob.executionToken !== null &&
            durableJob.executionToken !== handle.executionToken;
          if (terminal || ownedByAnotherLaunch) return;

          throw new Error(
            `Worker '${intent.jobId}' did not acquire durable execution; intent remains retryable`,
          );
        });
        options.logger.info(
          { intentId, idempotencyKey, jobId: intent.jobId, task: intent.task },
          'Dispatch intent launched',
        );
      });

      inFlight.set(idempotencyKey, launching);
      void launching.then(
        () => inFlight.delete(idempotencyKey),
        () => inFlight.delete(idempotencyKey),
      );
      return launching;
    },
  };
}
