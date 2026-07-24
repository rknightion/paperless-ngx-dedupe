import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createJob, getJob } from '../manager.js';
import { launchWorker } from '../worker-launcher.js';
import { JobType } from '../../types/enums.js';
import { consumeDispatchIntents, getDispatchIntent } from '../../scheduler/coordinator.js';
import { claimWorkerJob, runWorkerTaskWithData } from '../worker-entry.js';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('worker launcher readiness', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  async function job() {
    const directory = mkdtempSync(join(tmpdir(), 'paperless-worker-launcher-'));
    temporaryDirectories.push(directory);
    const dbPath = join(directory, 'jobs.sqlite');
    const { db, sqlite } = createDatabaseWithHandle(dbPath);
    await migrateDatabase(sqlite);
    const jobId = createJob(db, JobType.SYNC);
    return { db, sqlite, dbPath, jobId };
  }

  it('rejects readiness without failing the job when the worker module is missing', async () => {
    const { db, sqlite, dbPath, jobId } = await job();
    let handle: ReturnType<typeof launchWorker> | undefined;
    const now = new Date('2026-07-24T00:00:00.000Z');

    await expect(
      consumeDispatchIntents(
        {
          sqlite,
          async launchIntent() {
            handle = launchWorker({
              jobId,
              dbPath,
              workerScriptPath: join(dirname(dbPath), 'missing-worker-module.mjs'),
            });
            await handle.ready;
          },
        },
        now,
      ),
    ).resolves.toEqual({ dispatched: 0, retried: 1, deadLettered: 0 });
    await expect(handle!.done).rejects.toThrow();
    expect(getJob(db, jobId)?.status).toBe('pending');
    expect(
      sqlite
        .prepare(
          `SELECT status, attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt
           FROM dispatch_intent WHERE job_id = ?`,
        )
        .get(jobId),
    ).toEqual({
      status: 'pending',
      attemptCount: 1,
      nextAttemptAt: '2026-07-24T00:00:01.000Z',
    });
  });

  it('releases a claim made before readiness so the durable intent retries to one completion', async () => {
    const { db, sqlite, dbPath, jobId } = await job();
    const now = new Date('2026-07-24T00:00:00.000Z');
    let crashedHandle: ReturnType<typeof launchWorker> | undefined;

    await expect(
      consumeDispatchIntents(
        {
          sqlite,
          async launchIntent() {
            crashedHandle = launchWorker({
              jobId,
              dbPath,
              workerScriptPath: join(fixtureDirectory, 'worker-claim-then-crash.mjs'),
            });
            await crashedHandle.ready;
          },
        },
        now,
      ),
    ).resolves.toEqual({ dispatched: 0, retried: 1, deadLettered: 0 });
    await expect(crashedHandle!.done).rejects.toThrow('claimed before readiness then crashed');
    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({ status: 'pending', startedAt: null, executionToken: null });

    let executions = 0;
    const retryAt = new Date(now.getTime() + 1_000);
    await expect(
      consumeDispatchIntents(
        {
          sqlite,
          async launchIntent(intentId) {
            const intent = getDispatchIntent(sqlite, intentId);
            await runWorkerTaskWithData(
              async () => {
                executions += 1;
                return { completed: true };
              },
              {
                jobId: intent.jobId!,
                dbPath,
                executionToken: 'retry-owner',
              },
            );
          },
        },
        retryAt,
      ),
    ).resolves.toEqual({ dispatched: 1, retried: 0, deadLettered: 0 });
    await consumeDispatchIntents(
      {
        sqlite,
        async launchIntent() {
          executions += 1;
        },
      },
      new Date(retryAt.getTime() + 1_000),
    );

    expect(executions).toBe(1);
    expect(getJob(db, jobId)?.status).toBe('completed');
  });

  it('rejects a readiness acknowledgement with the wrong execution token and releases its claim', async () => {
    const { sqlite, dbPath, jobId } = await job();
    const handle = launchWorker({
      jobId,
      dbPath,
      workerScriptPath: join(fixtureDirectory, 'worker-wrong-token-ready.mjs'),
    });

    await expect(handle.ready).rejects.toThrow('before readiness acknowledgement');
    await expect(handle.done).resolves.toBeUndefined();
    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({ status: 'pending', startedAt: null, executionToken: null });
  });

  it('keeps a timeout-selected abort pre-ready when a valid readiness message arrives before exit', async () => {
    const { db, sqlite, dbPath, jobId } = await job();
    let finishTermination!: (code: number) => void;
    const termination = new Promise<number>((resolve) => {
      finishTermination = resolve;
    });
    class ControlledWorker extends EventEmitter {
      terminate = vi.fn(() => termination);
    }
    const worker = new ControlledWorker();
    const markJobFailed = vi.fn();
    const handle = launchWorker({
      jobId,
      dbPath,
      workerScriptPath: '/controlled-worker.mjs',
      createWorker: () => worker as never,
      markJobFailed,
    });
    expect(claimWorkerJob(sqlite, jobId, handle.executionToken)).toBe(true);

    const aborting = handle.abortBeforeReady();
    expect(aborting).toBeDefined();
    worker.emit('message', {
      type: 'worker-ready',
      jobId,
      executionToken: handle.executionToken,
      claimed: true,
    });
    worker.emit('exit', 1);
    finishTermination(1);

    await expect(aborting).resolves.toBeUndefined();
    await expect(handle.ready).rejects.toThrow('aborted before readiness acknowledgement');
    await expect(handle.done).rejects.toThrow('Worker exited with code 1');
    expect(markJobFailed).not.toHaveBeenCalled();
    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({ status: 'pending', startedAt: null, executionToken: null });
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE job_id = ?').get(jobId),
    ).toEqual({ status: 'pending' });

    let executions = 0;
    await expect(
      consumeDispatchIntents(
        {
          sqlite,
          async launchIntent(intentId) {
            const intent = getDispatchIntent(sqlite, intentId);
            await runWorkerTaskWithData(
              async () => {
                executions += 1;
                return { completed: true };
              },
              {
                jobId: intent.jobId!,
                dbPath,
                executionToken: 'retry-after-abort',
              },
            );
          },
        },
        new Date(),
      ),
    ).resolves.toEqual({ dispatched: 1, retried: 0, deadLettered: 0 });
    expect(executions).toBe(1);
    expect(getJob(db, jobId)?.status).toBe('completed');
  });

  it('marks the job failed when a worker crashes after readiness', async () => {
    const { db, dbPath, jobId } = await job();
    const handle = launchWorker({
      jobId,
      dbPath,
      workerScriptPath: join(fixtureDirectory, 'worker-ready-then-fail.mjs'),
    });

    await expect(handle.ready).resolves.toEqual({ claimed: true });
    await expect(handle.done).rejects.toThrow('post-ready worker failure');
    await expect.poll(() => getJob(db, jobId)?.status).toBe('failed');
  });

  it('does not fail a job when a durable no-op worker crashes after readiness', async () => {
    const { db, dbPath, jobId } = await job();
    const handle = launchWorker({
      jobId,
      dbPath,
      workerScriptPath: join(fixtureDirectory, 'worker-ready-then-fail.mjs'),
      taskData: { claimed: false },
    });

    await expect(handle.ready).resolves.toEqual({ claimed: false });
    await expect(handle.done).rejects.toThrow('post-ready worker failure');
    expect(getJob(db, jobId)?.status).toBe('pending');
  });
});
