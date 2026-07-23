import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import {
  clearJobHistory,
  completeJob,
  createJob,
  failJob,
  recoverStaleJobs,
  retryDeadLetterJob,
} from '../../jobs/manager.js';
import { JobType } from '../../types/enums.js';

import { OPERATION_COMPATIBILITY } from '../store.js';
import {
  acquireOperation,
  consumeDispatchIntents,
  enqueueDueSchedules,
  enqueueManualOperation,
  getDispatchIntent,
  renewOperationLease,
} from '../coordinator.js';

describe('schedule coordinator compatibility', () => {
  it('freezes the cross-operation compatibility matrix symmetrically', () => {
    const expected = {
      sync: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      analysis: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      duplicate_delete: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      ai_processing: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      ai_apply: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      ai_revert: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      backup: {
        sync: true,
        analysis: true,
        duplicate_delete: true,
        ai_processing: true,
        ai_apply: true,
        ai_revert: true,
        backup: false,
        checkpoint: true,
        vacuum: false,
        job_cleanup: true,
      },
      checkpoint: {
        sync: true,
        analysis: true,
        duplicate_delete: true,
        ai_processing: true,
        ai_apply: true,
        ai_revert: true,
        backup: true,
        checkpoint: false,
        vacuum: false,
        job_cleanup: true,
      },
      vacuum: {
        sync: false,
        analysis: false,
        duplicate_delete: false,
        ai_processing: false,
        ai_apply: false,
        ai_revert: false,
        backup: false,
        checkpoint: false,
        vacuum: false,
        job_cleanup: false,
      },
      job_cleanup: {
        sync: true,
        analysis: true,
        duplicate_delete: true,
        ai_processing: true,
        ai_apply: true,
        ai_revert: true,
        backup: true,
        checkpoint: true,
        vacuum: false,
        job_cleanup: false,
      },
    } as const;

    expect(OPERATION_COMPATIBILITY).toEqual(expected);
  });
});

describe('schedule coordinator durable claims', () => {
  let db: ReturnType<typeof createDatabaseWithHandle>['db'];
  let sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'];
  const temporaryDirectories: string[] = [];

  beforeEach(async () => {
    ({ db, sqlite } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(sqlite);
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('claims one due occurrence into one durable pending job', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO automation_schedule (
          id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        'sync-schedule',
        'sync',
        JSON.stringify({ kind: 'interval', hours: 2 }),
        'UTC',
        '2026-07-23T12:00:00.000Z',
        now.toISOString(),
        now.toISOString(),
      );

    const intents = enqueueDueSchedules(sqlite, now);

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      task: 'sync',
      triggerKind: 'schedule',
      scheduleId: 'sync-schedule',
      dueAt: now.toISOString(),
      status: 'pending',
    });
    expect(sqlite.prepare('SELECT count(*) AS count FROM job').get()).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare('SELECT last_claimed_due_at AS lastClaimedDueAt FROM automation_schedule')
        .get(),
    ).toEqual({ lastClaimedDueAt: now.toISOString() });
    expect(
      sqlite.prepare('SELECT next_due_at AS nextDueAt FROM automation_schedule').get(),
    ).toEqual({ nextDueAt: '2026-07-23T14:00:00.000Z' });
  });

  it('makes concurrent ticks and a manual dispatch share one active sync job', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO automation_schedule (
          id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
        ) VALUES ('sync-schedule', 'sync', 1, ?, 'UTC', ?, NULL, ?, ?)`,
      )
      .run(
        JSON.stringify({ kind: 'interval', hours: 2 }),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
      );

    const manual = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    expect(enqueueDueSchedules(sqlite, now)).toEqual([]);
    expect(enqueueDueSchedules(sqlite, now)).toEqual([]);
    expect(sqlite.prepare('SELECT count(*) AS count FROM dispatch_intent').get()).toEqual({
      count: 1,
    });
    expect(sqlite.prepare('SELECT count(*) AS count FROM job').get()).toEqual({ count: 1 });
    expect(manual.triggerKind).toBe('manual');
  });

  it('rolls back an occurrence claim when a crash happens after the job and intent inserts', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO automation_schedule (
          id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
        ) VALUES ('sync-schedule', 'sync', 1, ?, 'UTC', ?, NULL, ?, ?)`,
      )
      .run(
        JSON.stringify({ kind: 'interval', hours: 2 }),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
      );
    sqlite.exec(`
      CREATE TRIGGER crash_after_intent_insert
      AFTER INSERT ON dispatch_intent
      WHEN NEW.schedule_id = 'sync-schedule'
      BEGIN
        SELECT RAISE(ABORT, 'simulated crash after durable inserts');
      END;
    `);

    expect(() => enqueueDueSchedules(sqlite, now)).toThrow(/simulated crash/);
    expect(sqlite.prepare('SELECT count(*) AS count FROM job').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) AS count FROM dispatch_intent').get()).toEqual({
      count: 0,
    });
    expect(
      sqlite
        .prepare('SELECT last_claimed_due_at AS lastClaimedDueAt FROM automation_schedule')
        .get(),
    ).toEqual({ lastClaimedDueAt: null });
  });

  it('enforces cross-type compatibility leases while permitting safe maintenance', () => {
    acquireOperation(sqlite, 'sync', 'sync-job');
    expect(() => acquireOperation(sqlite, 'analysis', 'analysis-job')).toThrow(/incompatible/);
    expect(acquireOperation(sqlite, 'backup', 'backup-job')).toMatchObject({ operation: 'backup' });
  });

  it('retains a pending/running lease until explicit terminal release and records heartbeats', () => {
    const lease = acquireOperation(sqlite, 'sync', 'durable-sync-job');
    expect(lease.expiresAt).toBeNull();
    expect(
      renewOperationLease(sqlite, 'durable-sync-job', new Date('2040-01-01T00:00:00.000Z')),
    ).toBe(true);
    expect(() => acquireOperation(sqlite, 'analysis', 'blocked-analysis')).toThrow(/incompatible/);
    expect(
      sqlite
        .prepare('SELECT heartbeat_at AS heartbeatAt FROM operation_lease WHERE owner_id = ?')
        .get('durable-sync-job'),
    ).toEqual({ heartbeatAt: '2040-01-01T00:00:00.000Z' });
  });

  it('has a database partial index preventing duplicate active jobs of one type', () => {
    const now = '2026-07-23T12:00:00.000Z';
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at) VALUES ('first-sync', 'sync', 'pending', ?)`,
      )
      .run(now);

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO job (id, type, status, created_at) VALUES ('second-sync', 'sync', 'running', ?)`,
        )
        .run(now),
    ).toThrow(/UNIQUE constraint failed: job.type/);
  });

  it('dispatches only committed intents and does not relaunch after a post-launch crash', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    const launched: string[] = [];
    const executor = {
      sqlite,
      async launchIntent(intentId: string): Promise<void> {
        launched.push(intentId);
      },
    };

    await expect(
      consumeDispatchIntents(executor, new Date('2026-07-23T12:00:00.000Z')),
    ).resolves.toMatchObject({
      dispatched: 1,
      retried: 0,
      deadLettered: 0,
    });
    await consumeDispatchIntents(executor, new Date('2026-07-23T12:00:01.000Z'));

    expect(launched).toEqual([intent.id]);
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({
      status: 'dispatched',
    });
  });

  it('allows exactly one concurrent consumer on separate SQLite connections to launch an intent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'paperless-dedupe-coordinator-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'scheduler.sqlite');
    const first = createDatabaseWithHandle(databasePath);
    const second = createDatabaseWithHandle(databasePath);
    await migrateDatabase(first.sqlite);
    const intent = enqueueManualOperation(first.sqlite, 'sync', { kind: 'manual' });
    const now = new Date('2026-07-23T12:00:00.000Z');
    const launches: string[] = [];
    let releaseFirstLaunch: (() => void) | undefined;
    const firstLaunch = new Promise<void>((resolve) => {
      releaseFirstLaunch = resolve;
    });

    const firstConsumer = consumeDispatchIntents(
      {
        sqlite: first.sqlite,
        async launchIntent(intentId: string): Promise<void> {
          launches.push(intentId);
          await firstLaunch;
        },
      },
      now,
    );
    await Promise.resolve();
    const secondResult = await consumeDispatchIntents(
      {
        sqlite: second.sqlite,
        async launchIntent(intentId: string): Promise<void> {
          launches.push(intentId);
        },
      },
      now,
    );
    releaseFirstLaunch?.();
    await firstConsumer;

    expect(secondResult).toMatchObject({ dispatched: 0, retried: 0, deadLettered: 0 });
    expect(launches).toEqual([intent.id]);
  });

  it('recovers an expired launch claim through one stable executor idempotency key', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    const effects = new Set<string>();
    const keys: string[] = [];
    let releaseFirstLaunch: (() => void) | undefined;
    const firstLaunch = new Promise<void>((resolve) => {
      releaseFirstLaunch = resolve;
    });
    const first = consumeDispatchIntents(
      {
        sqlite,
        async launchIntent(_intentId: string, idempotencyKey: string): Promise<void> {
          keys.push(idempotencyKey);
          effects.add(idempotencyKey);
          await firstLaunch;
        },
      },
      new Date('2026-07-23T12:00:00.000Z'),
    );
    await Promise.resolve();
    await consumeDispatchIntents(
      {
        sqlite,
        async launchIntent(_intentId: string, idempotencyKey: string): Promise<void> {
          keys.push(idempotencyKey);
          effects.add(idempotencyKey);
        },
      },
      new Date('2026-07-23T12:06:00.000Z'),
    );
    releaseFirstLaunch?.();
    await first;

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(effects.size).toBe(1);
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'dispatched' });
  });

  it('does not let a late exhausted claimant fail a job reclaimed and dispatched by another consumer', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    sqlite.prepare('UPDATE dispatch_intent SET attempt_count = 5 WHERE id = ?').run(intent.id);
    let releaseFirstLaunch: (() => void) | undefined;
    const firstLaunch = new Promise<void>((resolve) => {
      releaseFirstLaunch = resolve;
    });
    const first = consumeDispatchIntents(
      {
        sqlite,
        async launchIntent(): Promise<void> {
          await firstLaunch;
          throw new Error('late exhausted launch failure');
        },
      },
      new Date('2026-07-23T12:00:00.000Z'),
    );
    await Promise.resolve();

    await expect(
      consumeDispatchIntents(
        { sqlite, async launchIntent(): Promise<void> {} },
        new Date('2026-07-23T12:06:00.000Z'),
      ),
    ).resolves.toMatchObject({ dispatched: 1, deadLettered: 0 });
    releaseFirstLaunch?.();
    await expect(first).resolves.toMatchObject({ dispatched: 0, deadLettered: 0 });

    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'dispatched' });
    expect(sqlite.prepare('SELECT status FROM job WHERE id = ?').get(intent.jobId)).toEqual({
      status: 'pending',
    });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM operation_lease WHERE owner_id = ?')
        .get(intent.jobId),
    ).toEqual({ count: 1 });
  });

  it('persists manual task data for an executor to resolve after a restart and retry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'paperless-dedupe-task-data-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'scheduler.sqlite');
    const first = createDatabaseWithHandle(databasePath);
    await migrateDatabase(first.sqlite);
    const taskData = { force: true, documentIds: [7, 42] };
    const intent = enqueueManualOperation(
      first.sqlite,
      'sync',
      { kind: 'manual' },
      'sync',
      taskData,
    );
    const afterRestart = createDatabaseWithHandle(databasePath);
    const resolved = getDispatchIntent(afterRestart.sqlite, intent.id);

    expect(resolved.taskData).toEqual(taskData);
    await expect(
      consumeDispatchIntents(
        {
          sqlite: afterRestart.sqlite,
          async launchIntent(intentId: string): Promise<void> {
            expect(getDispatchIntent(afterRestart.sqlite, intentId).taskData).toEqual(taskData);
            throw new Error('retry after restart');
          },
        },
        new Date('2026-07-23T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ retried: 1 });
    expect(getDispatchIntent(afterRestart.sqlite, intent.id).taskData).toEqual(taskData);
  });

  it('keeps a durable intent pending when launch crashes before the worker starts', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    const now = new Date('2026-07-23T12:00:00.000Z');
    const executor = {
      sqlite,
      async launchIntent(): Promise<void> {
        throw new Error('launcher crashed before worker start');
      },
    };

    await expect(consumeDispatchIntents(executor, now)).resolves.toMatchObject({
      dispatched: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(
      sqlite
        .prepare(
          'SELECT status, attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt FROM dispatch_intent WHERE id = ?',
        )
        .get(intent.id),
    ).toEqual({ status: 'pending', attemptCount: 1, nextAttemptAt: '2026-07-23T12:00:01.000Z' });
  });

  it('uses all five worker-launch backoff windows before dead-lettering', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    const executor = {
      sqlite,
      async launchIntent(): Promise<void> {
        throw new Error('worker launch failed');
      },
    };
    const attemptsAt = [
      '2026-07-23T12:00:00.000Z',
      '2026-07-23T12:00:01.000Z',
      '2026-07-23T12:00:06.000Z',
      '2026-07-23T12:00:36.000Z',
      '2026-07-23T12:02:36.000Z',
    ].map((value) => new Date(value));

    for (const timestamp of attemptsAt) {
      await expect(consumeDispatchIntents(executor, timestamp)).resolves.toMatchObject({
        retried: 1,
        deadLettered: 0,
      });
    }
    await expect(
      consumeDispatchIntents(executor, new Date('2026-07-23T12:07:36.000Z')),
    ).resolves.toMatchObject({
      retried: 0,
      deadLettered: 1,
    });
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'dead_letter' });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM operation_lease WHERE owner_id = ?')
        .get(intent.jobId),
    ).toEqual({ count: 0 });
  });

  it('consumes a changed scheduled sync once into an analysis dependency with root lineage', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const insertSchedule = sqlite.prepare(
      `INSERT INTO automation_schedule (
        id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
      ) VALUES (?, ?, 1, ?, 'UTC', ?, NULL, ?, ?)`,
    );
    insertSchedule.run(
      'sync-schedule',
      'sync',
      JSON.stringify({ kind: 'interval', hours: 2 }),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    insertSchedule.run(
      'analysis-schedule',
      'analysis',
      JSON.stringify({ kind: 'daily', hour: 12, minute: 0 }),
      '2026-07-24T12:00:00.000Z',
      now.toISOString(),
      now.toISOString(),
    );

    const [syncIntent] = enqueueDueSchedules(sqlite, now);
    completeJob(db, syncIntent.jobId!, { inserted: 1, updated: 0 });

    const dependencies = enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:01.000Z'));

    expect(dependencies).toEqual([
      expect.objectContaining({
        task: 'analysis',
        triggerKind: 'dependency',
        parentJobId: syncIntent.jobId,
        rootScheduleId: 'sync-schedule',
        rootDueAt: now.toISOString(),
      }),
    ]);
    expect(enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:02.000Z'))).toEqual([]);
  });

  it('does not enqueue dependent work when a scheduled sync changed no documents', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const insertSchedule = sqlite.prepare(
      `INSERT INTO automation_schedule (
        id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
      ) VALUES (?, ?, 1, ?, 'UTC', ?, NULL, ?, ?)`,
    );
    insertSchedule.run(
      'sync-schedule',
      'sync',
      JSON.stringify({ kind: 'interval', hours: 2 }),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    insertSchedule.run(
      'analysis-schedule',
      'analysis',
      JSON.stringify({ kind: 'daily', hour: 12, minute: 0 }),
      '2026-07-24T12:00:00.000Z',
      now.toISOString(),
      now.toISOString(),
    );
    const [syncIntent] = enqueueDueSchedules(sqlite, now);
    completeJob(db, syncIntent.jobId!, { inserted: 0, updated: 0 });

    expect(enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:01.000Z'))).toEqual([]);
  });

  it('enqueues AI only after a changed sync when the AI schedule is explicitly enabled', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const insertSchedule = sqlite.prepare(
      `INSERT INTO automation_schedule (
        id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'UTC', ?, NULL, ?, ?)`,
    );
    insertSchedule.run(
      'sync-schedule',
      'sync',
      1,
      JSON.stringify({ kind: 'interval', hours: 2 }),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    insertSchedule.run(
      'ai-schedule',
      'ai_processing',
      0,
      JSON.stringify({ kind: 'daily', hour: 12, minute: 0 }),
      '2026-07-24T12:00:00.000Z',
      now.toISOString(),
      now.toISOString(),
    );
    const [syncIntent] = enqueueDueSchedules(sqlite, now);
    completeJob(db, syncIntent.jobId!, { inserted: 1, updated: 0 });
    expect(enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:01.000Z'))).toEqual([]);

    sqlite.prepare('UPDATE automation_schedule SET enabled = 1 WHERE id = ?').run('ai-schedule');
    expect(enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:02.000Z'))).toEqual([
      expect.objectContaining({ task: 'ai_processing', parentJobId: syncIntent.jobId }),
    ]);
  });

  it('claims only the latest missed occurrence and persists the following occurrence', () => {
    const now = new Date('2026-07-23T12:30:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO automation_schedule (
          id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
        ) VALUES ('sync-schedule', 'sync', 1, ?, 'UTC', ?, NULL, ?, ?)`,
      )
      .run(
        JSON.stringify({ kind: 'interval', hours: 2 }),
        '2026-07-23T06:00:00.000Z',
        now.toISOString(),
        now.toISOString(),
      );

    const [intent] = enqueueDueSchedules(sqlite, now);

    expect(intent.dueAt).toBe('2026-07-23T12:00:00.000Z');
    expect(
      sqlite.prepare('SELECT next_due_at AS nextDueAt FROM automation_schedule').get(),
    ).toEqual({ nextDueAt: '2026-07-23T14:00:00.000Z' });
  });

  it('keeps a changed-sync dependency fact after job history cleanup and a scheduler restart', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const insertSchedule = sqlite.prepare(
      `INSERT INTO automation_schedule (
        id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at, created_at, updated_at
      ) VALUES (?, ?, 1, ?, 'UTC', ?, NULL, ?, ?)`,
    );
    insertSchedule.run(
      'sync-schedule',
      'sync',
      JSON.stringify({ kind: 'interval', hours: 2 }),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    insertSchedule.run(
      'analysis-schedule',
      'analysis',
      JSON.stringify({ kind: 'daily', hour: 12, minute: 0 }),
      '2026-07-24T12:00:00.000Z',
      now.toISOString(),
      now.toISOString(),
    );
    const [syncIntent] = enqueueDueSchedules(sqlite, now);
    completeJob(db, syncIntent.jobId!, { inserted: 1, updated: 0 });
    expect(clearJobHistory(db)).toBe(1);

    expect(enqueueDueSchedules(sqlite, new Date('2026-07-23T12:00:01.000Z'))).toEqual([
      expect.objectContaining({
        task: 'analysis',
        parentJobId: syncIntent.jobId,
        rootScheduleId: 'sync-schedule',
        rootDueAt: now.toISOString(),
      }),
    ]);
  });

  it('keeps the recovered operation lease until its pending intent is dispatched and completed', async () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    sqlite.prepare("UPDATE job SET status = 'running' WHERE id = ?").run(intent.jobId);

    expect(recoverStaleJobs(db)).toBe(1);
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'pending' });
    expect(() =>
      acquireOperation(sqlite, 'analysis', 'incompatible-before-recovery-dispatch'),
    ).toThrow(/incompatible/);

    await expect(
      consumeDispatchIntents({ sqlite, async launchIntent(): Promise<void> {} }, new Date()),
    ).resolves.toMatchObject({ dispatched: 1 });
    completeJob(db, intent.jobId!);
    expect(
      acquireOperation(sqlite, 'analysis', 'analysis-after-recovered-completion'),
    ).toMatchObject({
      operation: 'analysis',
    });
  });

  it('retries transient worker failures three times then dead-letters and permits explicit retry', () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    const jobId = intent.jobId!;

    failJob(db, jobId, 'network timeout');
    expect(
      sqlite
        .prepare('SELECT status, attempt, next_attempt_at AS nextAttemptAt FROM job WHERE id = ?')
        .get(jobId),
    ).toEqual(
      expect.objectContaining({ status: 'pending', attempt: 1, nextAttemptAt: expect.any(String) }),
    );
    for (let index = 0; index < 3; index += 1) failJob(db, jobId, 'HTTP 503 upstream failure');

    expect(
      sqlite
        .prepare('SELECT status, attempt, terminal_reason AS terminalReason FROM job WHERE id = ?')
        .get(jobId),
    ).toEqual({ status: 'failed', attempt: 3, terminalReason: 'automated_retry_exhausted' });
    expect(
      sqlite
        .prepare(
          'SELECT status, terminal_reason AS terminalReason FROM dispatch_intent WHERE id = ?',
        )
        .get(intent.id),
    ).toEqual({ status: 'dead_letter', terminalReason: 'automated_retry_exhausted' });
    expect(retryDeadLetterJob(db, jobId)).toBe(true);
    expect(
      sqlite
        .prepare('SELECT status, attempt, terminal_reason AS terminalReason FROM job WHERE id = ?')
        .get(jobId),
    ).toEqual({ status: 'pending', attempt: 0, terminalReason: null });
  });

  it('requires a compatible lease before manually reactivating a dead-letter job', () => {
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    failJob(db, intent.jobId!, 'configuration validation failed');
    acquireOperation(sqlite, 'sync', 'other-active-sync');

    expect(retryDeadLetterJob(db, intent.jobId!)).toBe(false);
    expect(sqlite.prepare('SELECT status FROM job WHERE id = ?').get(intent.jobId)).toEqual({
      status: 'failed',
    });
  });

  it('does not let the legacy createJob path bypass an existing compatible-operation lease', () => {
    enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });

    expect(() => createJob(db, JobType.ANALYSIS)).toThrow(/already running|incompatible/i);
  });

  it('never retries permission, validation, or configuration failures automatically', () => {
    for (const error of [
      'permission denied for configured Paperless account',
      'validation failed for requested operation',
      'configuration missing required API endpoint',
    ]) {
      const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
      failJob(db, intent.jobId!, error);

      expect(
        sqlite
          .prepare(
            'SELECT status, attempt, terminal_reason AS terminalReason FROM job WHERE id = ?',
          )
          .get(intent.jobId),
      ).toEqual({ status: 'failed', attempt: 0, terminalReason: 'automated_retry_not_allowed' });
      expect(
        sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
      ).toEqual({ status: 'dead_letter' });
    }
  });

  it('uses exact worker retry schedules for network, 429, and 5xx failures', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    const cases = [
      ['network timeout', '2026-07-23T12:01:00.000Z'],
      ['HTTP 429 rate limited', '2026-07-23T12:01:00.000Z'],
      ['HTTP 503 upstream failure', '2026-07-23T12:01:00.000Z'],
    ] as const;

    for (const [error, expectedNextAttemptAt] of cases) {
      const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
      failJob(db, intent.jobId!, error);
      expect(
        sqlite
          .prepare('SELECT status, next_attempt_at AS nextAttemptAt FROM job WHERE id = ?')
          .get(intent.jobId),
      ).toEqual({ status: 'pending', nextAttemptAt: expectedNextAttemptAt });
      completeJob(db, intent.jobId!);
    }
  });

  it('uses the complete 1m, 5m, 15m automated retry sequence before exhaustion', () => {
    vi.useFakeTimers();
    const intent = enqueueManualOperation(sqlite, 'sync', { kind: 'manual' });
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    failJob(db, intent.jobId!, 'network timeout');
    expect(
      sqlite
        .prepare('SELECT attempt, next_attempt_at AS nextAttemptAt FROM job WHERE id = ?')
        .get(intent.jobId),
    ).toEqual({ attempt: 1, nextAttemptAt: '2026-07-23T12:01:00.000Z' });

    vi.setSystemTime(new Date('2026-07-23T12:01:00.000Z'));
    failJob(db, intent.jobId!, 'network timeout');
    expect(
      sqlite
        .prepare('SELECT attempt, next_attempt_at AS nextAttemptAt FROM job WHERE id = ?')
        .get(intent.jobId),
    ).toEqual({ attempt: 2, nextAttemptAt: '2026-07-23T12:06:00.000Z' });

    vi.setSystemTime(new Date('2026-07-23T12:06:00.000Z'));
    failJob(db, intent.jobId!, 'network timeout');
    expect(
      sqlite
        .prepare('SELECT attempt, next_attempt_at AS nextAttemptAt FROM job WHERE id = ?')
        .get(intent.jobId),
    ).toEqual({ attempt: 3, nextAttemptAt: '2026-07-23T12:21:00.000Z' });

    vi.setSystemTime(new Date('2026-07-23T12:21:00.000Z'));
    failJob(db, intent.jobId!, 'network timeout');
    expect(
      sqlite
        .prepare('SELECT status, terminal_reason AS terminalReason FROM job WHERE id = ?')
        .get(intent.jobId),
    ).toEqual({ status: 'failed', terminalReason: 'automated_retry_exhausted' });
  });
});
