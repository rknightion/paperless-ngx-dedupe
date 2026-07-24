import {
  createDatabaseWithHandle,
  enqueueManualOperation,
  migrateDatabase,
} from '@paperless-dedupe/core';
import { claimWorkerJob } from '@paperless-dedupe/core/jobs/worker-entry.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { createJobDispatcher, resolveServerWorkerPath } from '../job-dispatcher.js';
import { createRuntimeAcceptingGate, RuntimeUnavailableError } from '../scheduler.js';

function createSqlite(intent: {
  id: string;
  jobId: string;
  task: string;
  status?: string;
  taskDataJson?: string | null;
  jobStatus?: string;
  executionToken?: string | null;
}) {
  return {
    prepare: vi.fn((query: string) => ({
      get: vi.fn(() =>
        query.includes('FROM job')
          ? {
              status: intent.jobStatus ?? 'pending',
              executionToken: intent.executionToken ?? null,
            }
          : {
              id: intent.id,
              jobId: intent.jobId,
              task: intent.task,
              status: intent.status ?? 'dispatching',
              taskDataJson: intent.taskDataJson ?? null,
            },
      ),
    })),
  };
}

describe('createJobDispatcher', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('resolves the explicit local workspace worker build', () => {
    const expected = '/repo/packages/core/dist/jobs/workers/sync-worker.js';

    expect(
      resolveServerWorkerPath('sync-worker', {
        cwd: '/repo/packages/web',
        exists: (candidate) => candidate === expected,
        fallback: vi.fn(),
      }),
    ).toBe(expected);
  });

  it('resolves the explicit production core worker layout', () => {
    const expected = '/app/core/jobs/workers/analysis-worker.js';

    expect(
      resolveServerWorkerPath('analysis-worker', {
        cwd: '/app',
        exists: (candidate) => candidate === expected,
        fallback: vi.fn(),
      }),
    ).toBe(expected);
  });

  it('resolves persisted task data and launches the matching worker', async () => {
    const sqlite = createSqlite({
      id: 'intent-1',
      jobId: 'job-1',
      task: 'sync',
      taskDataJson: JSON.stringify({ force: true, purge: true }),
    });
    const launch = vi.fn(() => ({
      jobId: 'job-1',
      worker: {},
      ready: Promise.resolve({ claimed: true }),
      done: Promise.resolve(),
    }));
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });

    await dispatcher.launchIntent('intent-1', 'dispatch-key');

    expect(launch).toHaveBeenCalledWith({
      jobId: 'job-1',
      dbPath: '/data/app.db',
      workerScriptPath: '/workers/sync-worker.js',
      taskData: { force: true, purge: true },
    });
  });

  it('does not acknowledge dispatch until the worker is ready', async () => {
    vi.useFakeTimers();
    const sqlite = createSqlite({
      id: 'intent-ready',
      jobId: 'job-ready',
      task: 'sync',
    });
    let acknowledge!: (value: { claimed: boolean }) => void;
    const ready = new Promise<{ claimed: boolean }>((resolve) => {
      acknowledge = resolve;
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: vi.fn(() => ({
        jobId: 'job-ready',
        worker: {},
        ready,
        done: new Promise<void>(() => undefined),
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });
    let settled = false;

    const launching = dispatcher
      .launchIntent('intent-ready', 'dispatch-key')
      .finally(() => (settled = true));
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    acknowledge({ claimed: true });
    await launching;
    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a readiness deadline that can outlive the durable dispatch claim', () => {
    expect(() =>
      createJobDispatcher({
        sqlite: createSqlite({
          id: 'intent-invalid-timeout',
          jobId: 'job-invalid-timeout',
          task: 'sync',
        }) as never,
        dbPath: '/data/app.db',
        logger: { info: vi.fn(), error: vi.fn() } as never,
        readinessTimeoutMs: 5 * 60 * 1000,
      }),
    ).toThrow('shorter than 300000ms');
  });

  it('terminates and retries a worker that never acknowledges readiness', async () => {
    vi.useFakeTimers();
    const sqlite = createSqlite({
      id: 'intent-timeout',
      jobId: 'job-timeout',
      task: 'sync',
    });
    let finishWorker!: () => void;
    const done = new Promise<void>((resolve) => {
      finishWorker = resolve;
    });
    const terminate = vi.fn(async () => {
      finishWorker();
      return 1;
    });
    const abortBeforeReady = vi.fn(async () => {
      await terminate();
      await done;
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      readinessTimeoutMs: 50,
      launchWorker: vi.fn(() => ({
        jobId: 'job-timeout',
        worker: { terminate },
        ready: new Promise<{ claimed: boolean }>(() => undefined),
        done,
        abortBeforeReady,
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });

    const launching = dispatcher.launchIntent('intent-timeout', 'dispatch-key');
    await vi.advanceTimersByTimeAsync(50);

    await expect(launching).rejects.toThrow('did not acknowledge readiness within 50ms');
    expect(abortBeforeReady).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('waits for termination and releases a claimed job before exposing a readiness timeout', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'paperless-dispatch-timeout-'));
    temporaryDirectories.push(directory);
    const dbPath = join(directory, 'jobs.sqlite');
    const { sqlite } = createDatabaseWithHandle(dbPath);
    await migrateDatabase(sqlite);
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' }, 'sync');
    const dispatcher = createJobDispatcher({
      sqlite,
      dbPath,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      readinessTimeoutMs: 500,
      getWorkerPath: vi.fn(() =>
        resolve('packages/core/src/jobs/__tests__/fixtures/worker-claim-then-hang.mjs'),
      ),
    });

    const launching = dispatcher.launchIntent(intent.id, intent.dispatchKey!);
    await expect
      .poll(
        () =>
          (
            sqlite
              .prepare('SELECT status, execution_token AS executionToken FROM job WHERE id = ?')
              .get(intent.jobId!) as { status: string; executionToken: string | null }
          ).status,
      )
      .toBe('running');
    await expect(launching).rejects.toThrow('did not acknowledge readiness within 500ms');

    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(intent.jobId!),
    ).toEqual({ status: 'pending', startedAt: null, executionToken: null });
    sqlite.close();
  });

  it('ignores a late readiness acknowledgement after timeout without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const sqlite = createSqlite({
      id: 'intent-late-ready',
      jobId: 'job-late-ready',
      task: 'analysis',
    });
    let acknowledge!: (value: { claimed: boolean }) => void;
    const ready = new Promise<{ claimed: boolean }>((resolve) => {
      acknowledge = resolve;
    });
    let finishWorker!: () => void;
    const done = new Promise<void>((resolve) => {
      finishWorker = resolve;
    });
    const terminate = vi.fn(async () => {
      finishWorker();
      return 1;
    });
    const abortBeforeReady = vi.fn(async () => {
      await terminate();
      await done;
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      readinessTimeoutMs: 25,
      launchWorker: vi.fn(() => ({
        jobId: 'job-late-ready',
        worker: { terminate },
        ready,
        done,
        abortBeforeReady,
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/analysis-worker.js'),
    });

    const launching = dispatcher.launchIntent('intent-late-ready', 'dispatch-key');
    await vi.advanceTimersByTimeAsync(25);
    await expect(launching).rejects.toThrow('did not acknowledge readiness within 25ms');

    acknowledge({ claimed: true });
    await Promise.resolve();
    expect(abortBeforeReady).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('does not launch a later intent after shutdown begins', async () => {
    const gate = createRuntimeAcceptingGate();
    const sqlite = createSqlite({
      id: 'intent-gated',
      jobId: 'job-gated',
      task: 'sync',
    });
    let acknowledge!: (value: { claimed: boolean }) => void;
    const ready = new Promise<{ claimed: boolean }>((resolve) => {
      acknowledge = resolve;
    });
    const launch = vi.fn(() => ({
      jobId: 'job-gated',
      worker: {},
      ready,
      done: new Promise<void>(() => undefined),
    }));
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      acceptingGate: gate,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });

    const first = dispatcher.launchIntent('intent-gated', 'first-key');
    await Promise.resolve();
    gate.stopAccepting();
    acknowledge({ claimed: true });
    await first;

    await expect(dispatcher.launchIntent('intent-gated', 'second-key')).rejects.toThrow(
      RuntimeUnavailableError,
    );
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('does not cancel an active worker when the accepting gate stops', async () => {
    const gate = createRuntimeAcceptingGate();
    const terminate = vi.fn();
    const sqlite = createSqlite({
      id: 'intent-active',
      jobId: 'job-active',
      task: 'analysis',
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      acceptingGate: gate,
      launchWorker: vi.fn(() => ({
        jobId: 'job-active',
        worker: { terminate },
        ready: Promise.resolve({ claimed: true }),
        done: new Promise<void>(() => undefined),
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/analysis-worker.js'),
    });

    await dispatcher.launchIntent('intent-active', 'dispatch-key');
    gate.stopAccepting();

    expect(terminate).not.toHaveBeenCalled();
  });

  it('retries instead of dispatching when a worker declines a still-pending job', async () => {
    const sqlite = createSqlite({
      id: 'intent-not-eligible',
      jobId: 'job-not-eligible',
      task: 'sync',
      jobStatus: 'pending',
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: vi.fn(() => ({
        jobId: 'job-not-eligible',
        executionToken: 'declined-launch',
        worker: {},
        ready: Promise.resolve({ claimed: false }),
        done: Promise.resolve(),
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });

    await expect(dispatcher.launchIntent('intent-not-eligible', 'dispatch-key')).rejects.toThrow(
      'did not acquire durable execution',
    );
  });

  it('accepts a declined worker only when another execution token durably owns the job', async () => {
    const sqlite = createSqlite({
      id: 'intent-other-owner',
      jobId: 'job-other-owner',
      task: 'analysis',
      jobStatus: 'running',
      executionToken: 'other-owner',
    });
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: vi.fn(() => ({
        jobId: 'job-other-owner',
        executionToken: 'declined-launch',
        worker: {},
        ready: Promise.resolve({ claimed: false }),
        done: Promise.resolve(),
      })) as never,
      getWorkerPath: vi.fn(() => '/workers/analysis-worker.js'),
    });

    await expect(dispatcher.launchIntent('intent-other-owner', 'dispatch-key')).resolves.toBe(
      undefined,
    );
  });

  it('uses one launch for concurrent calls with the same intent id', async () => {
    const sqlite = createSqlite({
      id: 'intent-2',
      jobId: 'job-2',
      task: 'analysis',
      taskDataJson: JSON.stringify({ force: false }),
    });
    const launch = vi.fn(() => ({
      jobId: 'job-2',
      worker: {},
      ready: Promise.resolve({ claimed: true }),
      done: new Promise<void>(() => undefined),
    }));
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/analysis-worker.js'),
    });

    await Promise.all([
      dispatcher.launchIntent('intent-2', 'dispatch-key'),
      dispatcher.launchIntent('intent-2', 'dispatch-key'),
    ]);

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two executor instances claim durable task execution', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const intent = enqueueManualOperation(sqlite, 'analysis', { kind: 'manual' }, 'analysis', {
      force: true,
    });
    let executions = 0;
    const launch = vi.fn((options: { jobId: string }) => {
      const executionToken = `executor-${launch.mock.calls.length}`;
      if (claimWorkerJob(sqlite, options.jobId, executionToken)) executions += 1;
      return {
        jobId: options.jobId,
        executionToken,
        worker: {},
        ready: Promise.resolve({ claimed: executions === 1 }),
        done: Promise.resolve(),
      };
    });
    const options = {
      sqlite,
      dbPath: ':memory:',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/analysis-worker.js'),
    };
    const first = createJobDispatcher(options);
    const second = createJobDispatcher(options);

    await Promise.all([
      first.launchIntent(intent.id, intent.dispatchKey!),
      second.launchIntent(intent.id, intent.dispatchKey!),
    ]);

    expect(launch).toHaveBeenCalledTimes(2);
    expect(executions).toBe(1);
    sqlite.close();
  });

  it('does not relaunch an intent already marked dispatched', async () => {
    const sqlite = createSqlite({
      id: 'intent-3',
      jobId: 'job-3',
      task: 'ai_processing',
      status: 'dispatched',
    });
    const launch = vi.fn();
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/ai-processing-worker.js'),
    });

    await dispatcher.launchIntent('intent-3', 'dispatch-key');

    expect(launch).not.toHaveBeenCalled();
  });

  it('consumes a legacy intent whose direct worker already owns the job', async () => {
    const sqlite = createSqlite({
      id: 'intent-legacy',
      jobId: 'job-legacy',
      task: 'ai_apply',
      jobStatus: 'running',
    });
    const launch = vi.fn();
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(),
    });

    await dispatcher.launchIntent('intent-legacy', 'dispatch-key');

    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects malformed persisted task data before worker launch', async () => {
    const sqlite = createSqlite({
      id: 'intent-4',
      jobId: 'job-4',
      task: 'sync',
      taskDataJson: '{not-json',
    });
    const launch = vi.fn();
    const dispatcher = createJobDispatcher({
      sqlite: sqlite as never,
      dbPath: '/data/app.db',
      logger: { info: vi.fn(), error: vi.fn() } as never,
      launchWorker: launch as never,
      getWorkerPath: vi.fn(() => '/workers/sync-worker.js'),
    });

    await expect(dispatcher.launchIntent('intent-4', 'dispatch-key')).rejects.toThrow(
      'invalid persisted task data',
    );
    expect(launch).not.toHaveBeenCalled();
  });
});
