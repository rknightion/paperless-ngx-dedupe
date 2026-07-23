import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createJob, recoverStaleJobs } from '../manager.js';
import { JobType } from '../../types/enums.js';
import { claimWorkerJob, runWorkerTaskWithData } from '../worker-entry.js';
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

    const first = runWorkerTaskWithData(task, { jobId, dbPath: databasePath });
    await taskStarted;
    await runWorkerTaskWithData(task, { jobId, dbPath: databasePath });

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

    expect(claimWorkerJob(sqlite, jobId, new Date('2026-07-23T12:00:59.999Z'))).toBe(false);
    expect(claimWorkerJob(sqlite, jobId, new Date('2026-07-23T12:01:00.000Z'))).toBe(true);
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
      { jobId, dbPath: databasePath },
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
