import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { reviewedMutationPlan } from '../../schema/sqlite/review.js';
import { dispatchIntent, operationLease } from '../../schema/sqlite/automation.js';
import { job } from '../../schema/sqlite/jobs.js';
import type { AppDatabase } from '../../db/client.js';
import { createJob, retryDeadLetterJob } from '../../jobs/manager.js';
import { JobType } from '../../types/enums.js';
import {
  claimDuplicateDeletionPlan,
  createDuplicateDeletionPlan,
  getReviewedMutationPlan,
  revalidateFrozenDuplicateGroup,
  withDuplicateMutationLease,
  type MutationPlanError,
} from '../mutation-plans.js';
import { setGroupStatus } from '../../queries/duplicates.js';

function seedGroup(db: AppDatabase): void {
  db.insert(document)
    .values([
      {
        id: 'doc-primary',
        paperlessId: 101,
        title: 'Primary',
        syncedAt: '2026-07-24T09:00:00.000Z',
      },
      {
        id: 'doc-delete-1',
        paperlessId: 202,
        title: 'Duplicate one',
        syncedAt: '2026-07-24T09:00:00.000Z',
      },
      {
        id: 'doc-delete-2',
        paperlessId: 303,
        title: 'Duplicate two',
        syncedAt: '2026-07-24T09:00:00.000Z',
      },
    ])
    .run();
  db.insert(duplicateGroup)
    .values({
      id: 'group-1',
      confidenceScore: 0.97,
      algorithmVersion: 'wave-3',
      status: 'pending',
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T10:00:00.000Z',
    })
    .run();
  db.insert(duplicateMember)
    .values([
      {
        id: 'member-primary',
        groupId: 'group-1',
        documentId: 'doc-primary',
        isPrimary: true,
      },
      {
        id: 'member-delete-1',
        groupId: 'group-1',
        documentId: 'doc-delete-1',
        isPrimary: false,
      },
      {
        id: 'member-delete-2',
        groupId: 'group-1',
        documentId: 'doc-delete-2',
        isPrimary: false,
      },
    ])
    .run();
}

describe('reviewed duplicate deletion plans', () => {
  let db: AppDatabase;
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedGroup(db);
  });

  it('freezes group, timestamp, primary, and exact non-primary Paperless identities', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
      tokenFactory: () => 'opaque-review-token-with-sufficient-entropy',
    });

    expect(preview).toMatchObject({
      token: 'opaque-review-token-with-sufficient-entropy',
      expiresAt: '2026-07-24T11:15:00.000Z',
      groups: [
        {
          groupId: 'group-1',
          updatedAt: '2026-07-24T10:00:00.000Z',
          primaryDocumentId: 'doc-primary',
          primaryPaperlessId: 101,
          nonPrimaryDocuments: [
            { documentId: 'doc-delete-1', paperlessId: 202 },
            { documentId: 'doc-delete-2', paperlessId: 303 },
          ],
        },
      ],
    });

    const persisted = getReviewedMutationPlan(
      db,
      preview.token,
      'duplicate_delete',
      new Date('2026-07-24T11:01:00.000Z'),
    );
    expect(persisted.tokenHash).not.toContain(preview.token);
    expect(JSON.parse(persisted.payloadJson)).toEqual({
      groups: preview.groups,
    });
    expect(persisted.consumedAt).toBeNull();
  });

  it('atomically binds a plan to one job while allowing the same job to resume', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
      tokenFactory: () => 'single-use-opaque-review-token-000000000001',
    });

    expect(
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'job-owner',
        new Date('2026-07-24T11:14:59.999Z'),
      ),
    ).toEqual({ planId: expect.any(String), groups: preview.groups });
    expect(
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'job-owner',
        new Date('2026-07-24T11:30:00.000Z'),
      ),
    ).toEqual({ planId: expect.any(String), groups: preview.groups });
    expect(
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'job-owner',
        new Date('2026-07-24T11:14:59.999Z'),
      ),
    ).toEqual({ planId: expect.any(String), groups: preview.groups });
    expect(() =>
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'different-job',
        new Date('2026-07-24T11:14:59.999Z'),
      ),
    ).toThrow(expect.objectContaining<Partial<MutationPlanError>>({ reason: 'claimed' }));

    const expired = createDuplicateDeletionPlan(db, ['group-1'], {
      now: new Date('2026-07-24T12:00:00.000Z'),
      tokenFactory: () => 'expired-opaque-review-token-00000000000001',
    });
    expect(() =>
      claimDuplicateDeletionPlan(
        db,
        expired.token,
        'job-owner',
        new Date('2026-07-24T12:15:00.000Z'),
      ),
    ).toThrow(expect.objectContaining<Partial<MutationPlanError>>({ reason: 'expired' }));
  });

  it('allows only one of two file-backed connections to claim the same token', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'review-claim-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'claim.sqlite');
    const first = createDatabaseWithHandle(databasePath);
    await migrateDatabase(first.sqlite);
    seedGroup(first.db);
    const preview = createDuplicateDeletionPlan(first.db, ['group-1'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
      tokenFactory: () => 'concurrent-opaque-review-token-000000000001',
    });

    first.sqlite.close();
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const start = new Int32Array(barrier);
    const workers = ['job-one', 'job-two'].map(
      (jobId) =>
        new Worker(new URL('./fixtures/claim-plan-worker.ts', import.meta.url), {
          workerData: {
            databasePath,
            token: preview.token,
            jobId,
            barrier,
          },
          execArgv: ['--import', 'tsx'],
        }),
    );
    const results = await new Promise<Array<{ status: string; reason?: string }>>(
      (resolve, reject) => {
        let ready = 0;
        const received: Array<{ status: string; reason?: string }> = [];
        for (const worker of workers) {
          worker.on('error', reject);
          worker.on('message', (message: { type: string; status?: string; reason?: string }) => {
            if (message.type === 'ready') {
              ready++;
              if (ready === workers.length) {
                Atomics.store(start, 0, 1);
                Atomics.notify(start, 0, workers.length);
              }
            } else if (message.type === 'result' && message.status) {
              received.push({ status: message.status, reason: message.reason });
              if (received.length === workers.length) resolve(received);
            }
          });
        }
      },
    );

    expect(results).toEqual(
      expect.arrayContaining([
        { status: 'claimed', reason: undefined },
        { status: 'rejected', reason: 'claimed' },
      ]),
    );
    await Promise.all(workers.map((worker) => worker.terminate()));
  });

  it('preserves the job identity across a real dead-letter manual retry', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const jobId = createJob(db, JobType.BATCH_OPERATION, { planToken: preview.token });
    claimDuplicateDeletionPlan(db, preview.token, jobId, new Date('2026-07-24T11:01:00.000Z'));
    db.update(job)
      .set({
        status: 'failed',
        terminalReason: 'automated_retry_not_allowed',
      })
      .where(eq(job.id, jobId))
      .run();
    db.update(dispatchIntent)
      .set({
        status: 'dead_letter',
        terminalReason: 'automated_retry_not_allowed',
      })
      .where(eq(dispatchIntent.jobId, jobId))
      .run();
    db.delete(operationLease).where(eq(operationLease.ownerId, jobId)).run();

    expect(retryDeadLetterJob(db, jobId)).toBe(true);
    expect(db.select({ status: job.status }).from(job).where(eq(job.id, jobId)).get()?.status).toBe(
      'pending',
    );
    expect(() =>
      claimDuplicateDeletionPlan(db, preview.token, jobId, new Date('2026-07-24T11:02:00.000Z')),
    ).not.toThrow();
    expect(() =>
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'replacement-job',
        new Date('2026-07-24T11:02:00.000Z'),
      ),
    ).toThrow(expect.objectContaining<Partial<MutationPlanError>>({ reason: 'claimed' }));
  });

  it('rejects a corrupted persisted payload with a bounded plan error', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const persisted = getReviewedMutationPlan(
      db,
      preview.token,
      'duplicate_delete',
      new Date('2026-07-24T11:01:00.000Z'),
    );
    db.update(reviewedMutationPlan)
      .set({ payloadJson: '{"groups":' })
      .where(eq(reviewedMutationPlan.id, persisted.id))
      .run();

    expect(() =>
      claimDuplicateDeletionPlan(
        db,
        preview.token,
        'job-owner',
        new Date('2026-07-24T11:02:00.000Z'),
      ),
    ).toThrow(expect.objectContaining<Partial<MutationPlanError>>({ reason: 'invalid_payload' }));
  });

  it('conflicts when the primary changes without relying on the group timestamp', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1']);
    db.update(duplicateMember)
      .set({ isPrimary: false })
      .where(eq(duplicateMember.documentId, 'doc-primary'))
      .run();
    db.update(duplicateMember)
      .set({ isPrimary: true })
      .where(eq(duplicateMember.documentId, 'doc-delete-1'))
      .run();

    expect(revalidateFrozenDuplicateGroup(db, preview.groups[0])).toEqual({
      ok: false,
      reason: 'changed',
    });
  });

  it('conflicts when analysis rewrites the group membership with the same timestamp', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1']);
    db.transaction((tx) => {
      tx.delete(duplicateGroup).where(eq(duplicateGroup.id, 'group-1')).run();
      tx.insert(duplicateGroup)
        .values({
          id: 'group-1',
          confidenceScore: 0.96,
          algorithmVersion: 'wave-3-rewrite',
          status: 'pending',
          createdAt: '2026-07-24T09:00:00.000Z',
          updatedAt: '2026-07-24T10:00:00.000Z',
        })
        .run();
      tx.insert(duplicateMember)
        .values([
          {
            id: 'rewritten-primary',
            groupId: 'group-1',
            documentId: 'doc-primary',
            isPrimary: true,
          },
          {
            id: 'rewritten-delete',
            groupId: 'group-1',
            documentId: 'doc-delete-2',
            isPrimary: false,
          },
        ])
        .run();
    });

    expect(revalidateFrozenDuplicateGroup(db, preview.groups[0])).toEqual({
      ok: false,
      reason: 'changed',
    });
  });

  it('classifies a group removed after preview as missing', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1']);
    db.delete(duplicateGroup).where(eq(duplicateGroup.id, 'group-1')).run();

    expect(revalidateFrozenDuplicateGroup(db, preview.groups[0])).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('reads the group and members from one snapshot when a writer races the member read', () => {
    const preview = createDuplicateDeletionPlan(db, ['group-1']);
    const writer = vi.fn(() => {
      db.update(duplicateMember)
        .set({ isPrimary: true })
        .where(eq(duplicateMember.documentId, 'doc-delete-1'))
        .run();
    });

    expect(
      revalidateFrozenDuplicateGroup(db, preview.groups[0], {
        afterGroupRead: writer,
      }),
    ).toEqual({ ok: false, reason: 'changed' });
    expect(writer).toHaveBeenCalledOnce();
  });

  it('rejects status and primary writers while a reviewed deletion owns the common lease', () => {
    db.$client
      .prepare(
        `INSERT INTO operation_lease (
          id, operation, owner_id, acquired_at, heartbeat_at, expires_at
        ) VALUES (?, 'duplicate_delete', ?, ?, ?, NULL)`,
      )
      .run('deletion-lease', 'delete-job', '2026-07-24T11:00:00.000Z', '2026-07-24T11:00:00.000Z');

    expect(() =>
      withDuplicateMutationLease(db, () => setGroupStatus(db, 'group-1', 'ignored')),
    ).toThrow(/incompatible with an active operation/);
    expect(
      db
        .select({ status: duplicateGroup.status })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.id, 'group-1'))
        .get()?.status,
    ).toBe('pending');
  });
});
