import {
  consumeDispatchIntents,
  enqueueDueSchedules,
  enqueueManualOperation,
  type AppConfig,
  type AppDatabase,
  type DispatchIntent,
  type Logger,
  type OperationKind,
  type SchedulerDispatchExecutor,
  type SchedulerTickResult,
} from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';
import {
  createRuntimeAcceptingGate,
  RuntimeUnavailableError,
  type RuntimeAcceptingGate,
} from './runtime-gate.js';

export {
  createRuntimeAcceptingGate,
  RuntimeUnavailableError,
  type RuntimeAcceptingGate,
} from './runtime-gate.js';

export interface ServerRuntime {
  config: AppConfig;
  db: AppDatabase;
  sqlite: Database.Database;
  logger: Logger;
  dispatcher: SchedulerDispatchExecutor;
  acceptingGate: RuntimeAcceptingGate;
  enqueueManual(task: OperationKind, jobType: string, taskData?: unknown): DispatchIntent;
  dispatchPending(): Promise<SchedulerTickResult>;
  evaluate(): Promise<void>;
  schedulerController?: SchedulerController;
}

export interface SchedulerController {
  stopAccepting(): void;
}

export interface CreateRuntimeOptions {
  config: AppConfig;
  db: AppDatabase;
  sqlite: Database.Database;
  logger: Logger;
  dispatcher: SchedulerDispatchExecutor;
  acceptingGate?: RuntimeAcceptingGate;
  evaluate?: () => Promise<void>;
}

export function initializeRuntimeOnce<T>(
  state: { promise?: Promise<T> },
  initialize: () => Promise<T>,
): Promise<T> {
  if (state.promise) return state.promise;

  const pending = initialize();
  const guarded = pending.catch((error: unknown) => {
    if (state.promise === guarded) state.promise = undefined;
    throw error;
  });
  state.promise = guarded;
  return guarded;
}

export function createRuntime(options: CreateRuntimeOptions): ServerRuntime {
  const acceptingGate = options.acceptingGate ?? createRuntimeAcceptingGate();
  const runtime: ServerRuntime = {
    config: options.config,
    db: options.db,
    sqlite: options.sqlite,
    logger: options.logger,
    dispatcher: options.dispatcher,
    acceptingGate,
    enqueueManual: (task, jobType, taskData) =>
      acceptingGate.run(() =>
        enqueueManualOperation(options.sqlite, task, { kind: 'manual' }, jobType, taskData),
      ),
    dispatchPending: async () => {
      acceptingGate.assertAccepting();
      const result = await consumeDispatchIntents(options.dispatcher, new Date());
      acceptingGate.assertAccepting();
      return result;
    },
    evaluate:
      options.evaluate ??
      (async () => {
        acceptingGate.assertAccepting();
        const now = new Date();
        enqueueDueSchedules(runtime.sqlite, now);
        acceptingGate.assertAccepting();
        await consumeDispatchIntents(runtime.dispatcher, now);
      }),
  };
  return runtime;
}

export function startScheduler(runtime: ServerRuntime, intervalMs: number): SchedulerController {
  if (runtime.schedulerController) return runtime.schedulerController;

  let accepting = true;
  let evaluating = false;

  const evaluate = async () => {
    if (!accepting || evaluating) return;
    evaluating = true;
    try {
      await runtime.evaluate();
    } catch (error) {
      if (!(error instanceof RuntimeUnavailableError)) {
        runtime.logger.error({ error }, 'Scheduled work evaluation failed');
      }
    } finally {
      evaluating = false;
    }
  };

  const timer = setInterval(() => void evaluate(), intervalMs);
  timer.unref();
  void evaluate();

  const controller: SchedulerController = {
    stopAccepting() {
      if (!accepting) return;
      accepting = false;
      runtime.acceptingGate.stopAccepting();
      clearInterval(timer);
      runtime.logger.info('Stopped accepting scheduled work');
    },
  };
  runtime.schedulerController = controller;
  return controller;
}
