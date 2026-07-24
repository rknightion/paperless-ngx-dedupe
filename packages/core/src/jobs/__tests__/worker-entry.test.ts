import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import {
  completeJob,
  createJob,
  failJob,
  recoverStaleJobs,
  updateJobProgress,
} from '../manager.js';
import { JobType } from '../../types/enums.js';
import {
  claimWorkerJob,
  releaseWorkerClaimForRetry,
  runWorkerTaskWithData,
} from '../worker-entry.js';
import { consumeDispatchIntents, getDispatchIntent } from '../../scheduler/coordinator.js';

describe('worker entry durable execution claim', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  async function database() {
    const directory = mkdtempSync(join(tmpdir(), 'paperless-dedupe-worker-entry-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'scheduler.sqlite');
    const handle = createDatabaseWithHandle(databasePath);
    await migrateDatabase(handle.sqlite);
    return { ...handle, databasePath };
  }

  it('runs a task once when two worker processes claim the same durable job', async () => {
    const { db, databasePath } = await database();
    const jobId = createJob(db, JobType.SYNC);
    let executions = 0;
    let releaseTask: (() => void) | undefined;
    const taskRelease = new Promise<void>((resolve) => {
      releaseTask = resolve;
    });
    let markStarted: (() => void) | undefined;
    const taskStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const task = async () => {
      executions += 1;
      markStarted?.();
      await taskRelease;
      return { completed: true };
    };

    const first = runWorkerTaskWithData(task, {
      jobId,
      dbPath: databasePath,
      executionToken: 'first-owner',
    });
    await taskStarted;
    await runWorkerTaskWithData(task, {
      jobId,
      dbPath: databasePath,
      executionToken: 'second-owner',
    });

    expect(executions).toBe(1);
    releaseTask?.();
    await first;
    expect(
      db
        .select()
        .from((await import('../../schema/sqlite/jobs.js')).job)
        .get()?.status,
    ).toBe('completed');
  });

  it('allows a retry-eligible pending job to be claimed only at its due time', async () => {
    const { db, sqlite } = await database();
    const jobId = createJob(db, JobType.SYNC);
    sqlite
      .prepare("UPDATE job SET next_attempt_at = '2026-07-23T12:01:00.000Z' WHERE id = ?")
      .run(jobId);

    expect(claimWorkerJob(sqlite, jobId, 'early-owner', new Date('2026-07-23T12:00:59.999Z'))).toBe(
      false,
    );
    expect(claimWorkerJob(sqlite, jobId, 'due-owner', new Date('2026-07-23T12:01:00.000Z'))).toBe(
      true,
    );
  });

  it('persists the execution token and only its owner can release a pre-ready claim', async () => {
    const { db, sqlite } = await database();
    const jobId = createJob(db, JobType.SYNC);

    expect(
      claimWorkerJob(sqlite, jobId, 'launch-owner', new Date('2026-07-23T12:00:00.000Z')),
    ).toBe(true);
    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({
      status: 'running',
      startedAt: '2026-07-23T12:00:00.000Z',
      executionToken: 'launch-owner',
    });

    expect(releaseWorkerClaimForRetry(sqlite, jobId, 'wrong-token')).toBe(false);
    expect(
      sqlite
        .prepare('SELECT status, execution_token AS executionToken FROM job WHERE id = ?')
        .get(jobId),
    ).toEqual({ status: 'running', executionToken: 'launch-owner' });

    expect(releaseWorkerClaimForRetry(sqlite, jobId, 'launch-owner')).toBe(true);
    expect(
      sqlite
        .prepare(
          `SELECT status, started_at AS startedAt, execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({ status: 'pending', startedAt: null, executionToken: null });
  });

  it('does not let an old execution token overwrite a newer claim', async () => {
    const { db, sqlite } = await database();
    const jobId = createJob(db, JobType.SYNC);
    expect(claimWorkerJob(sqlite, jobId, 'old-owner')).toBe(true);
    expect(releaseWorkerClaimForRetry(sqlite, jobId, 'old-owner')).toBe(true);
    expect(claimWorkerJob(sqlite, jobId, 'new-owner')).toBe(true);

    updateJobProgress(db, jobId, 0.75, 'stale progress', undefined, 'old-owner');
    completeJob(db, jobId, { stale: true }, 'old-owner');
    failJob(db, jobId, 'stale failure', 'old-owner');

    expect(
      sqlite
        .prepare(
          `SELECT status, progress, progress_message AS progressMessage,
                  result_json AS resultJson, error_message AS errorMessage,
                  execution_token AS executionToken
           FROM job WHERE id = ?`,
        )
        .get(jobId),
    ).toEqual({
      status: 'running',
      progress: 0,
      progressMessage: null,
      resultJson: null,
      errorMessage: null,
      executionToken: 'new-owner',
    });

    completeJob(db, jobId, { completed: true }, 'new-owner');
    expect(
      sqlite
        .prepare('SELECT status, execution_token AS executionToken FROM job WHERE id = ?')
        .get(jobId),
    ).toEqual({ status: 'completed', executionToken: null });
  });

  it('acknowledges the durable claim before executing the task', async () => {
    const { db, databasePath } = await database();
    const jobId = createJob(db, JobType.SYNC);
    const events: unknown[] = [];

    await runWorkerTaskWithData(
      async () => {
        expect(events).toEqual([
          { type: 'worker-ready', jobId, executionToken: 'ready-owner', claimed: true },
        ]);
        return { completed: true };
      },
      { jobId, dbPath: databasePath, executionToken: 'ready-owner' },
      (event) => events.push(event),
    );

    expect(events).toEqual([
      { type: 'worker-ready', jobId, executionToken: 'ready-owner', claimed: true },
    ]);
  });

  it('returns a restart-recovered job to pending so it executes once after the retained lease clears', async () => {
    const { db, sqlite, databasePath } = await database();
    const jobId = createJob(db, JobType.SYNC);
    sqlite.prepare("UPDATE job SET status = 'running' WHERE id = ?").run(jobId);

    expect(recoverStaleJobs(db)).toBe(1);
    expect(sqlite.prepare('SELECT status FROM job WHERE id = ?').get(jobId)).toEqual({
      status: 'pending',
    });
    expect(() => createJob(db, JobType.ANALYSIS)).toThrow(/already running|incompatible/i);

    let executions = 0;
    await runWorkerTaskWithData(
      async () => {
        executions += 1;
        return { recovered: true };
      },
      { jobId, dbPath: databasePath, executionToken: 'recovered-owner' },
    );
    expect(executions).toBe(1);
  });

  it('reconciles only a persisted post-launch pre-worker crash after reopen and executes it once', async () => {
    const first = await database();
    const jobId = createJob(first.db, JobType.SYNC);
    const intent = first.sqlite
      .prepare('SELECT id FROM dispatch_intent WHERE job_id = ?')
      .get(jobId) as { id: string };
    // Persist the exact boundary after launchWorker() returned but before the
    // new thread won worker-side CAS: job pending, intent dispatched, lease held.
    first.sqlite
      .prepare(
        `UPDATE dispatch_intent
         SET status = 'dispatched', dispatch_claim_token = NULL, dispatch_claimed_at = NULL,
             dispatch_claim_expires_at = NULL
         WHERE id = ?`,
      )
      .run(intent.id);
    first.sqlite.close();

    const restarted = createDatabaseWithHandle(first.databasePath);
    await migrateDatabase(restarted.sqlite);
    expect(recoverStaleJobs(restarted.db)).toBe(1);
    expect(restarted.sqlite.prepare('SELECT status FROM job WHERE id = ?').get(jobId)).toEqual({
      status: 'pending',
    });
    expect(
      restarted.sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'pending' });
    expect(
      restarted.sqlite
        .prepare('SELECT count(*) AS count FROM operation_lease WHERE owner_id = ?')
        .get(jobId),
    ).toEqual({ count: 1 });

    let executions = 0;
    const dispatcher = {
      sqlite: restarted.sqlite,
      async launchIntent(intentId: string): Promise<void> {
        const durableIntent = getDispatchIntent(restarted.sqlite, intentId);
        await runWorkerTaskWithData(
          async () => {
            executions += 1;
            return { reconciled: true };
          },
          {
            jobId: durableIntent.jobId!,
            dbPath: first.databasePath,
            executionToken: 'reconciled-owner',
            taskData: durableIntent.taskData,
          },
        );
      },
    };
    const now = new Date();
    await expect(consumeDispatchIntents(dispatcher, now)).resolves.toMatchObject({ dispatched: 1 });
    await consumeDispatchIntents(dispatcher, new Date(now.getTime() + 1_000));

    expect(executions).toBe(1);
    expect(restarted.sqlite.prepare('SELECT status FROM job WHERE id = ?').get(jobId)).toEqual({
      status: 'completed',
    });
  });
});
