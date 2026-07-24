import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  createJob,
  getJob,
  listJobs,
  listJobHistory,
  getJobHistoryCounts,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
  recoverStaleJobs,
  clearJobHistory,
  retryDeadLetterJob,
  JobAlreadyRunningError,
  type JobHistoryQuery,
} from '../manager.js';
import { JobType, JobStatus } from '../../types/enums.js';
import { job as jobTable } from '../../schema/sqlite/jobs.js';
import { dispatchIntent } from '../../schema/sqlite/automation.js';
import { reviewedMutationPlan } from '../../schema/sqlite/review.js';
import { eq, sql } from 'drizzle-orm';

describe('Job Manager', () => {
  let db: AppDatabase;
  const legacyJobKeys = [
    'attempt',
    'completedAt',
    'createdAt',
    'dueAt',
    'errorMessage',
    'executionToken',
    'id',
    'nextAttemptAt',
    'parentJobId',
    'phaseProgress',
    'progress',
    'progressMessage',
    'resultJson',
    'rootDueAt',
    'rootScheduleId',
    'scheduleId',
    'startedAt',
    'status',
    'terminalReason',
    'triggerKind',
    'type',
  ];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  describe('createJob', () => {
    it('should create a job and return an ID', () => {
      const id = createJob(db, JobType.SYNC);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should create a job with pending status', () => {
      const id = createJob(db, JobType.SYNC);
      const job = getJob(db, id);
      expect(job).not.toBeNull();
      expect(job!.status).toBe('pending');
      expect(job!.type).toBe('sync');
      expect(job!.progress).toBe(0);
    });

    it('should reject duplicate running job of same type', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id);
      const id2 = createJob(db, JobType.SYNC);
      // Set to running directly
      db.update(jobTable).set({ status: 'running' }).where(eq(jobTable.id, id2)).run();

      expect(() => createJob(db, JobType.SYNC)).toThrow(JobAlreadyRunningError);
    });

    it('should reject if pending job of same type exists', () => {
      createJob(db, JobType.SYNC);
      expect(() => createJob(db, JobType.SYNC)).toThrow(JobAlreadyRunningError);
    });

    it('should reject different incompatible operation types', () => {
      createJob(db, JobType.SYNC);
      expect(() => createJob(db, JobType.ANALYSIS)).toThrow(JobAlreadyRunningError);
    });

    it('serializes manual custom-field discovery against sync', () => {
      createJob(db, JobType.SYNC);
      expect(() => createJob(db, JobType.CUSTOM_FIELD_DISCOVERY)).toThrow(JobAlreadyRunningError);
    });

    it('should allow new job after previous completed', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      const id2 = createJob(db, JobType.SYNC);
      expect(id2).toBeTruthy();
      expect(id2).not.toBe(id1);
    });

    it('should allow new job after previous failed', () => {
      const id1 = createJob(db, JobType.SYNC);
      failJob(db, id1, 'test error');
      const id2 = createJob(db, JobType.SYNC);
      expect(id2).toBeTruthy();
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', () => {
      expect(getJob(db, 'nonexistent')).toBeNull();
    });

    it('should return the job by ID', () => {
      const id = createJob(db, JobType.SYNC);
      const job = getJob(db, id);
      expect(job).not.toBeNull();
      expect(job!.id).toBe(id);
      expect(Object.keys(job!).sort()).toEqual(legacyJobKeys);
    });
  });

  describe('listJobs', () => {
    it('should return empty list when no jobs', () => {
      const jobs = listJobs(db);
      expect(jobs).toEqual([]);
    });

    it('should list all jobs ordered by createdAt desc', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      // Ensure different createdAt by manually setting an earlier timestamp
      db.update(jobTable)
        .set({ createdAt: '2024-01-01T00:00:00.000Z' })
        .where(eq(jobTable.id, id1))
        .run();
      const id2 = createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db);
      expect(jobs).toHaveLength(2);
      expect(Object.keys(jobs[0]).sort()).toEqual(legacyJobKeys);
      // Most recent first
      expect(jobs[0].id).toBe(id2);
    });

    it('should filter by type', () => {
      const syncId = createJob(db, JobType.SYNC);
      completeJob(db, syncId);
      const analysisId = createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db, { type: JobType.ANALYSIS });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(analysisId);
    });

    it('should filter by status', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db, { status: JobStatus.COMPLETED });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(id1);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        const id = createJob(db, JobType.SYNC);
        completeJob(db, id);
      }
      const jobs = listJobs(db, { limit: 3 });
      expect(jobs).toHaveLength(3);
    });
  });

  describe('listJobHistory', () => {
    function insertHistoryJob(
      id: string,
      createdAt: string,
      type: string = JobType.SYNC,
      status: string = JobStatus.COMPLETED,
      lineage?: {
        parentJobId?: string;
        rootScheduleId?: string;
        rootDueAt?: string;
      },
    ) {
      db.insert(jobTable)
        .values({
          id,
          type,
          status,
          createdAt,
          parentJobId: lineage?.parentJobId,
          rootScheduleId: lineage?.rootScheduleId,
          rootDueAt: lineage?.rootDueAt,
        })
        .run();
    }

    it('paginates equal timestamps by descending id without gaps or duplicates', () => {
      for (let index = 0; index < 7; index += 1) {
        insertHistoryJob(`job-${String(index).padStart(2, '0')}`, '2026-07-23T12:00:00.000Z');
      }
      db.update(jobTable)
        .set({ progress: sql`CAST(SUBSTR(${jobTable.id}, 5) AS REAL) / 100` })
        .run();

      const first = listJobHistory(db, { limit: 3 });
      const second = listJobHistory(db, { limit: 3, cursor: first.nextCursor ?? undefined });
      const third = listJobHistory(db, { limit: 3, cursor: second.nextCursor ?? undefined });

      expect([...first.items, ...second.items].map(({ progress }) => progress)).toEqual([
        0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
      ]);
      expect(third.items.map(({ progress }) => progress)).toEqual([0]);
      expect(first.nextCursor).toBeTruthy();
      expect(second.nextCursor).toBeTruthy();
      expect(third.nextCursor).toBeNull();
    });

    it('applies status and type filters on every cursor page', () => {
      for (let index = 0; index < 8; index += 1) {
        insertHistoryJob(
          `filtered-${index}`,
          `2026-07-23T12:00:${String(index).padStart(2, '0')}.000Z`,
          index % 2 === 0 ? JobType.SYNC : JobType.ANALYSIS,
          index < 6 ? JobStatus.COMPLETED : JobStatus.FAILED,
        );
      }

      const first = listJobHistory(db, {
        type: JobType.SYNC,
        status: JobStatus.COMPLETED,
        limit: 2,
      });
      const second = listJobHistory(db, {
        type: JobType.SYNC,
        status: JobStatus.COMPLETED,
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });

      expect([...first.items, ...second.items].map(({ createdAt }) => createdAt)).toEqual([
        '2026-07-23T12:00:04.000Z',
        '2026-07-23T12:00:02.000Z',
        '2026-07-23T12:00:00.000Z',
      ]);
      expect(
        [...first.items, ...second.items].every(
          (item) => item.type === JobType.SYNC && item.status === JobStatus.COMPLETED,
        ),
      ).toBe(true);
    });

    it('rejects invalid filters, limits, and cursors', () => {
      expect(() => listJobHistory(db, { type: 'unknown' as JobType })).toThrow(
        /type must be one of/,
      );
      expect(() => listJobHistory(db, { status: 'unknown' as JobStatus })).toThrow(
        /status must be one of/,
      );
      expect(() => listJobHistory(db, { limit: 0 })).toThrow(/limit must be between/);
      expect(() => listJobHistory(db, { limit: 101 })).toThrow(/limit must be between/);
      expect(() => listJobHistory(db, { cursor: '' })).toThrow(/cursor is invalid/);
      expect(() => listJobHistory(db, { cursor: 'not-a-cursor' })).toThrow(/cursor is invalid/);
    });

    it('keeps schema-valid legacy job identifiers private in opaque cursors', () => {
      const longLegacyId = `job:legacy/with spaces.ü-${'x'.repeat(160)}`;
      insertHistoryJob(longLegacyId, '2026-07-23T12:00:00.000Z');
      insertHistoryJob('older', '2026-07-22T12:00:00.000Z');

      const first = listJobHistory(db, { limit: 1 });
      expect(first.nextCursor).toBeTruthy();
      expect(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')).not.toContain(
        longLegacyId,
      );
      expect(listJobHistory(db, { limit: 1, cursor: first.nextCursor! }).items).toHaveLength(1);
    });

    it('uses a stable persisted public key instead of deriving it from private job fields', () => {
      insertHistoryJob('private-stable-id', '2026-07-23T12:00:00.000Z');

      const before = listJobHistory(db).items[0].key;
      db.update(jobTable)
        .set({ createdAt: '2026-07-24T12:00:00.000Z' })
        .where(eq(jobTable.id, 'private-stable-id'))
        .run();
      const after = listJobHistory(db).items[0].key;

      expect(before).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(after).toBe(before);
    });

    it('rejects a canonical cursor whose public key is unknown or tampered', () => {
      insertHistoryJob('private-boundary-id', '2026-07-23T12:00:00.000Z');
      insertHistoryJob('older', '2026-07-22T12:00:00.000Z');
      const cursor = listJobHistory(db, { limit: 1 }).nextCursor!;
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        key: string;
      };

      expect(Object.keys(decoded)).toEqual(['key']);
      const tampered = Buffer.from(
        JSON.stringify({
          key: `${decoded.key.slice(0, -1)}${decoded.key.endsWith('A') ? 'B' : 'A'}`,
        }),
        'utf8',
      ).toString('base64url');
      expect(() => listJobHistory(db, { limit: 1, cursor: tampered })).toThrow(/cursor is invalid/);
      const unknown = Buffer.from(JSON.stringify({ key: 'A'.repeat(32) }), 'utf8').toString(
        'base64url',
      );
      expect(() => listJobHistory(db, { limit: 1, cursor: unknown })).toThrow(/cursor is invalid/);
    });

    it('fails closed when an unexpected row has no public history key', () => {
      insertHistoryJob('private-null-key-id', '2026-07-23T12:00:00.000Z');
      const sqlite = (db as unknown as { $client: Database.Database }).$client;
      sqlite
        .prepare(`UPDATE job SET public_history_key = NULL WHERE id = 'private-null-key-id'`)
        .run();

      expect(() => listJobHistory(db)).toThrow(/public key invariant/);
    });

    it('keeps child lineage after clearing its referenced historical parent', () => {
      insertHistoryJob('historical-parent', '2026-07-23T12:00:00.000Z');
      insertHistoryJob(
        'active-child',
        '2026-07-23T12:01:00.000Z',
        JobType.ANALYSIS,
        JobStatus.PENDING,
        {
          parentJobId: 'historical-parent',
          rootScheduleId: 'daily-sync',
          rootDueAt: '2026-07-23T12:00:00.000Z',
        },
      );

      expect(clearJobHistory(db)).toBe(1);
      expect(getJob(db, 'historical-parent')).toBeNull();
      expect(getJob(db, 'active-child')).toMatchObject({
        parentJobId: 'historical-parent',
        rootScheduleId: 'daily-sync',
        rootDueAt: '2026-07-23T12:00:00.000Z',
      });
    });

    it('keeps every private field out of the full response and decoded cursor', () => {
      db.insert(jobTable)
        .values({
          id: 'private-job-id-SENTINEL',
          type: JobType.ANALYSIS,
          status: JobStatus.FAILED,
          progress: 0.25,
          progressMessage: 'private-progress-SENTINEL',
          errorMessage: 'private-error-SENTINEL',
          resultJson: '{"title":"private-result-SENTINEL"}',
          createdAt: '2026-07-23T12:00:00.000Z',
        })
        .run();
      insertHistoryJob('older-private-id', '2026-07-22T12:00:00.000Z');

      const page = listJobHistory(db, { limit: 1 });

      expect(page.items).toEqual([
        {
          key: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
          type: JobType.ANALYSIS,
          status: JobStatus.FAILED,
          progress: 0.25,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-07-23T12:00:00.000Z',
        },
      ]);
      const serialized = JSON.stringify(page);
      const decodedCursor = Buffer.from(page.nextCursor!, 'base64url').toString('utf8');
      for (const sentinel of [
        'private-job-id-SENTINEL',
        'private-progress-SENTINEL',
        'private-error-SENTINEL',
        'private-result-SENTINEL',
      ]) {
        expect(serialized).not.toContain(sentinel);
        expect(decodedCursor).not.toContain(sentinel);
      }
      expect(Object.keys(JSON.parse(decodedCursor))).toEqual(['key']);
      expect(getJobHistoryCounts(db)).toEqual({ clearable: 2 });
    });

    it('preserves manually retryable dead letters during cleanup', () => {
      const id = createJob(db, JobType.SYNC);
      for (let attempt = 0; attempt < 4; attempt += 1) failJob(db, id, 'network timeout');

      expect(getJob(db, id)).toMatchObject({
        status: JobStatus.FAILED,
        terminalReason: 'automated_retry_exhausted',
      });
      expect(clearJobHistory(db)).toBe(0);
      expect(retryDeadLetterJob(db, id)).toBe(true);
      expect(getJob(db, id)?.status).toBe(JobStatus.PENDING);
    });

    it('preserves jobs referenced by reviewed plans and dependency intents', () => {
      insertHistoryJob('reviewed-job', '2026-07-23T12:00:00.000Z');
      insertHistoryJob('lineage-parent', '2026-07-23T12:00:01.000Z');
      db.insert(reviewedMutationPlan)
        .values({
          id: 'plan-1',
          tokenHash: 'token-1',
          operation: 'ai_apply',
          expiresAt: '2026-07-24T12:00:00.000Z',
          payloadJson: '{}',
          claimedByJobId: 'reviewed-job',
        })
        .run();
      db.insert(dispatchIntent)
        .values({
          id: 'dependent-intent',
          task: 'analysis',
          operation: 'analysis',
          jobId: null,
          triggerKind: 'dependency',
          parentJobId: 'lineage-parent',
          rootScheduleId: 'schedule-1',
          rootDueAt: '2026-07-23T12:00:00.000Z',
          status: 'pending',
          createdAt: '2026-07-23T12:00:00.000Z',
          updatedAt: '2026-07-23T12:00:00.000Z',
        })
        .run();

      expect(clearJobHistory(db)).toBe(0);
      expect(getJob(db, 'reviewed-job')).not.toBeNull();
      expect(getJob(db, 'lineage-parent')).not.toBeNull();
    });

    it('coherently removes a clearable job and its terminal dispatch intent', () => {
      const id = createJob(db, JobType.ANALYSIS);
      completeJob(db, id);

      expect(clearJobHistory(db)).toBe(1);
      expect(getJob(db, id)).toBeNull();
      expect(
        db.select().from(dispatchIntent).where(eq(dispatchIntent.jobId, id)).get(),
      ).toBeUndefined();
    });

    it('traverses every 50k cursor shape deeply with stable equal-timestamp boundaries and indexed plans', () => {
      const sqlite = (db as unknown as { $client: Database.Database }).$client;
      const insert = sqlite.prepare(
        `INSERT INTO job (
           id, type, status, progress, attempt, created_at, public_history_key
         ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      );
      const expected = {
        all: 50_000,
        completed: 0,
        sync: 0,
        syncCompleted: 0,
      };
      sqlite.transaction(() => {
        for (let index = 0; index < 50_000; index += 1) {
          const type = index % 2 === 0 ? JobType.SYNC : JobType.ANALYSIS;
          const status =
            index % 3 === 0
              ? JobStatus.COMPLETED
              : index % 3 === 1
                ? JobStatus.FAILED
                : JobStatus.CANCELLED;
          if (status === JobStatus.COMPLETED) expected.completed += 1;
          if (type === JobType.SYNC) expected.sync += 1;
          if (type === JobType.SYNC && status === JobStatus.COMPLETED) {
            expected.syncCompleted += 1;
          }
          insert.run(
            `bulk-${String(index).padStart(5, '0')}`,
            type,
            status,
            index / 50_000,
            index >= 40_000
              ? '2026-07-24T12:00:00.000Z'
              : new Date(Date.UTC(2026, 6, 23, 0, 0, index)).toISOString(),
            index.toString(16).padStart(32, '0'),
          );
        }
      })();

      const traverse = (
        filters: Pick<JobHistoryQuery, 'type' | 'status'>,
        expectedTotal: number,
      ) => {
        let cursor: string | undefined;
        const seen = new Set<string>();
        const progress: number[] = [];
        let pages = 0;
        do {
          const page = listJobHistory(db, {
            ...filters,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          });
          page.items.forEach((item) => {
            seen.add(item.key);
            progress.push(item.progress ?? -1);
          });
          cursor = page.nextCursor ?? undefined;
          pages += 1;
        } while (cursor);
        expect(seen).toHaveLength(expectedTotal);
        expect(progress).toHaveLength(expectedTotal);
        expect(pages).toBeGreaterThan(80);
        expect(cursor).toBeUndefined();
        for (let index = 1; index < Math.min(progress.length, 10_000); index += 1) {
          expect(progress[index]).toBeLessThan(progress[index - 1]);
        }
      };

      traverse({}, expected.all);
      traverse({ status: JobStatus.COMPLETED }, expected.completed);
      traverse({ type: JobType.SYNC }, expected.sync);
      traverse({ type: JobType.SYNC, status: JobStatus.COMPLETED }, expected.syncCompleted);

      const explain = (where: string, parameters: unknown[]) =>
        (
          sqlite
            .prepare(
              `EXPLAIN QUERY PLAN
               SELECT id, type, status, progress, started_at, completed_at, created_at
               FROM job ${where}
               ORDER BY created_at DESC, id DESC LIMIT 101`,
            )
            .all(...parameters) as { detail: string }[]
        )
          .map(({ detail }) => detail)
          .join('\n');
      const cursorWhere = `(created_at < ? OR (created_at = ? AND id < ?))`;
      const cursorArgs = ['2026-07-24T12:00:00.000Z', '2026-07-24T12:00:00.000Z', 'bulk-45000'];
      const publicKeyPlan = explain(`WHERE public_history_key = ?`, [
        (45_000).toString(16).padStart(32, '0'),
      ]);
      expect(publicKeyPlan).toContain('job_public_history_key_unique');
      const plans = [
        [explain(`WHERE ${cursorWhere}`, cursorArgs), 'job_history_order_idx'],
        [
          explain(`WHERE status = ? AND ${cursorWhere}`, ['completed', ...cursorArgs]),
          'job_history_status_order_idx',
        ],
        [
          explain(`WHERE type = ? AND ${cursorWhere}`, ['sync', ...cursorArgs]),
          'job_history_type_order_idx',
        ],
        [
          explain(`WHERE type = ? AND status = ? AND ${cursorWhere}`, [
            'sync',
            'completed',
            ...cursorArgs,
          ]),
          'job_history_type_status_order_idx',
        ],
      ] as const;
      for (const [plan, indexName] of plans) {
        expect(plan).toContain(indexName);
        expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY');
      }
    }, 20_000);
  });

  describe('updateJobProgress', () => {
    it('should update progress', () => {
      const id = createJob(db, JobType.SYNC);
      updateJobProgress(db, id, 0.5, 'Halfway');
      const job = getJob(db, id);
      expect(job!.progress).toBe(0.5);
      expect(job!.progressMessage).toBe('Halfway');
    });

    it('should clamp progress to [0, 1]', () => {
      const id = createJob(db, JobType.SYNC);
      updateJobProgress(db, id, 1.5);
      expect(getJob(db, id)!.progress).toBe(1);
      updateJobProgress(db, id, -0.5);
      expect(getJob(db, id)!.progress).toBe(0);
    });
  });

  describe('completeJob', () => {
    it('should set status to completed', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id, { count: 42 });
      const job = getJob(db, id);
      expect(job!.status).toBe('completed');
      expect(job!.progress).toBe(1);
      expect(job!.completedAt).toBeTruthy();
      expect(JSON.parse(job!.resultJson!)).toEqual({ count: 42 });
    });
  });

  describe('failJob', () => {
    it('should set status to failed', () => {
      const id = createJob(db, JobType.SYNC);
      failJob(db, id, 'Something went wrong');
      const job = getJob(db, id);
      expect(job!.status).toBe('failed');
      expect(job!.errorMessage).toBe('Something went wrong');
      expect(job!.completedAt).toBeTruthy();
    });

    it.each([JobType.AI_APPLY, JobType.AI_REVERT])(
      'retries transient %s worker failures before durable dead-letter and manual retry',
      (type) => {
        const id = createJob(db, type, { planToken: 'opaque-reviewed-plan-token' });

        for (let attempt = 1; attempt <= 3; attempt++) {
          failJob(db, id, 'Paperless network timeout');
          expect(getJob(db, id)).toMatchObject({
            status: 'pending',
            attempt,
            terminalReason: null,
          });
          expect(
            db.select().from(dispatchIntent).where(eq(dispatchIntent.jobId, id)).get(),
          ).toMatchObject({
            status: 'pending',
            taskDataJson: JSON.stringify({ planToken: 'opaque-reviewed-plan-token' }),
          });
        }

        failJob(db, id, 'Paperless network timeout');
        expect(getJob(db, id)).toMatchObject({
          status: 'failed',
          attempt: 3,
          terminalReason: 'automated_retry_exhausted',
        });
        expect(
          db.select().from(dispatchIntent).where(eq(dispatchIntent.jobId, id)).get(),
        ).toMatchObject({ status: 'dead_letter' });

        expect(retryDeadLetterJob(db, id)).toBe(true);
        expect(getJob(db, id)).toMatchObject({ status: 'pending', attempt: 0 });
      },
    );
  });

  describe('recoverStaleJobs', () => {
    it('should requeue running jobs while preserving their restart audit', () => {
      const id = createJob(db, JobType.SYNC);
      db.update(jobTable).set({ status: 'running' }).where(eq(jobTable.id, id)).run();

      const recovered = recoverStaleJobs(db);
      expect(recovered).toBe(1);

      const j = getJob(db, id);
      expect(j!.status).toBe('pending');
      expect(j!.errorMessage).toBe('Job interrupted by application restart');
      expect(j!.completedAt).toBeNull();
      expect(j!.terminalReason).toBe('restart_interrupted');
    });

    it('should preserve pending durable jobs for dispatcher recovery', () => {
      const id = createJob(db, JobType.SYNC);

      const recovered = recoverStaleJobs(db);
      expect(recovered).toBe(0);

      const j = getJob(db, id);
      expect(j!.status).toBe('pending');
    });

    it('should leave a pending job while recovering a running job', () => {
      const syncId = createJob(db, JobType.SYNC);
      db.update(jobTable).set({ status: 'running' }).where(eq(jobTable.id, syncId)).run();

      const recovered = recoverStaleJobs(db);
      expect(recovered).toBe(1);

      expect(getJob(db, syncId)!.status).toBe('pending');
    });

    it('should not touch completed or failed jobs', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      const id2 = createJob(db, JobType.ANALYSIS);
      failJob(db, id2, 'previous error');

      const recovered = recoverStaleJobs(db);
      expect(recovered).toBe(0);

      expect(getJob(db, id1)!.status).toBe('completed');
      expect(getJob(db, id2)!.status).toBe('failed');
      expect(getJob(db, id2)!.errorMessage).toBe('previous error');
    });

    it('should return 0 when no stale jobs exist', () => {
      expect(recoverStaleJobs(db)).toBe(0);
    });

    it('should retain the recovered operation lease until its durable intent is resolved', () => {
      const id1 = createJob(db, JobType.SYNC);
      db.update(jobTable).set({ status: 'running' }).where(eq(jobTable.id, id1)).run();

      recoverStaleJobs(db);

      expect(() => createJob(db, JobType.SYNC)).toThrow(JobAlreadyRunningError);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job', () => {
      const id = createJob(db, JobType.SYNC);
      const result = cancelJob(db, id);
      expect(result).toBe(true);
      expect(getJob(db, id)!.status).toBe('cancelled');
    });

    it('should return false for nonexistent job', () => {
      expect(cancelJob(db, 'nonexistent')).toBe(false);
    });

    it('should return false for already completed job', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id);
      expect(cancelJob(db, id)).toBe(false);
    });

    it('should return false for already failed job', () => {
      const id = createJob(db, JobType.SYNC);
      failJob(db, id, 'error');
      expect(cancelJob(db, id)).toBe(false);
    });

    it('should return false for already cancelled job', () => {
      const id = createJob(db, JobType.SYNC);
      cancelJob(db, id);
      expect(cancelJob(db, id)).toBe(false);
    });
  });
});
