import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { operationLease } from '../../schema/sqlite/automation.js';
import {
  claimDuplicateDeletionPlan,
  createDuplicateDeletionPlan,
  getReviewedMutationPlan,
  type MutationPlanError,
} from '../../review/mutation-plans.js';
import { PaperlessApiError, PaperlessConnectionError } from '../../paperless/errors.js';
import type { AppDatabase } from '../../db/client.js';
import type { WorkerContext } from '../worker-entry.js';

const mocks = vi.hoisted(() => ({
  runWorkerTask: vi.fn(),
}));

vi.mock('../worker-entry.js', () => ({
  runWorkerTask: mocks.runWorkerTask,
}));

const { DuplicateDeleteLeaseError, executeReviewedDuplicateDeletion } =
  await import('./batch-worker.js');

function seedGroup(
  db: AppDatabase,
  groupId: string,
  primaryId: string,
  primaryPaperlessId: number,
  duplicateId: string,
  duplicatePaperlessId: number,
): void {
  db.insert(document)
    .values([
      {
        id: primaryId,
        paperlessId: primaryPaperlessId,
        title: `${groupId} primary`,
        syncedAt: '2026-07-24T09:00:00.000Z',
      },
      {
        id: duplicateId,
        paperlessId: duplicatePaperlessId,
        title: `${groupId} duplicate`,
        syncedAt: '2026-07-24T09:00:00.000Z',
      },
    ])
    .run();
  db.insert(duplicateGroup)
    .values({
      id: groupId,
      confidenceScore: 0.95,
      algorithmVersion: 'wave-3',
      status: 'pending',
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T10:00:00.000Z',
    })
    .run();
  db.insert(duplicateMember)
    .values([
      {
        id: `${groupId}-primary-member`,
        groupId,
        documentId: primaryId,
        isPrimary: true,
      },
      {
        id: `${groupId}-duplicate-member`,
        groupId,
        documentId: duplicateId,
        isPrimary: false,
      },
    ])
    .run();
}

describe('reviewed duplicate deletion worker', () => {
  let handle: ReturnType<typeof createDatabaseWithHandle>;
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    seedGroup(handle.db, 'changed-group', 'doc-1', 101, 'doc-2', 102);
    seedGroup(handle.db, 'stable-group', 'doc-3', 201, 'doc-4', 202);
    handle.db
      .insert(operationLease)
      .values({
        id: 'duplicate-delete-lease',
        operation: 'duplicate_delete',
        ownerId: 'job-1',
        acquiredAt: '2026-07-24T11:00:00.000Z',
      })
      .run();
  });

  it('conflicts a changed group without deletion while unaffected groups continue', async () => {
    const preview = createDuplicateDeletionPlan(handle.db, ['changed-group', 'stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    handle.db
      .update(duplicateGroup)
      .set({ updatedAt: '2026-07-24T11:01:00.000Z' })
      .where(eq(duplicateGroup.id, 'changed-group'))
      .run();
    const client = {
      deleteDocument: vi.fn().mockResolvedValue(undefined),
    };

    const result = await executeReviewedDuplicateDeletion(
      {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'job-1',
        taskData: { planToken: preview.token },
        executionToken: 'execution-1',
      } satisfies WorkerContext,
      vi.fn(),
      client,
      new Date('2026-07-24T11:02:00.000Z'),
    );

    expect(client.deleteDocument).toHaveBeenCalledTimes(1);
    expect(client.deleteDocument).toHaveBeenCalledWith(202);
    expect(result).toMatchObject({
      deletedDocuments: 1,
      deletedGroups: 1,
      conflicts: [{ groupId: 'changed-group', reason: 'changed' }],
      errors: [],
    });
    expect(
      handle.db
        .select({ status: duplicateGroup.status })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.id, 'changed-group'))
        .get()?.status,
    ).toBe('pending');
    expect(
      handle.db
        .select({ status: duplicateGroup.status })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.id, 'stable-group'))
        .get()?.status,
    ).toBe('deleted');
  });

  it('does not delete when membership changes between the group and member snapshot reads', async () => {
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const client = { deleteDocument: vi.fn() };

    const result = await executeReviewedDuplicateDeletion(
      {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'job-1',
        taskData: { planToken: preview.token },
      },
      vi.fn(),
      client,
      new Date('2026-07-24T11:01:00.000Z'),
      {
        afterRevalidationGroupRead: () => {
          handle.db
            .update(duplicateMember)
            .set({ isPrimary: true })
            .where(eq(duplicateMember.documentId, 'doc-4'))
            .run();
        },
      },
    );

    expect(client.deleteDocument).not.toHaveBeenCalled();
    expect(result.conflicts).toEqual([{ groupId: 'stable-group', reason: 'changed' }]);
  });

  it('treats Paperless 404 as an idempotent deletion without exposing the remote body', async () => {
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const client = {
      deleteDocument: vi
        .fn()
        .mockRejectedValue(
          new PaperlessApiError('Not found', 404, 'sensitive upstream response body'),
        ),
    };

    const result = await executeReviewedDuplicateDeletion(
      {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'job-1',
        taskData: { planToken: preview.token },
      },
      vi.fn(),
      client,
      new Date('2026-07-24T11:01:00.000Z'),
    );

    expect(result).toMatchObject({
      deletedDocuments: 1,
      alreadyMissingDocuments: 1,
      deletedGroups: 1,
      conflicts: [],
      errors: [],
    });
    expect(JSON.stringify(result)).not.toContain('sensitive upstream response body');
  });

  it('requires the common lease before consuming or using a plan', async () => {
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    handle.db.delete(operationLease).run();
    const client = { deleteDocument: vi.fn() };

    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        client,
        new Date('2026-07-24T11:01:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(DuplicateDeleteLeaseError);
    expect(client.deleteDocument).not.toHaveBeenCalled();
    expect(() =>
      getReviewedMutationPlan(
        handle.db,
        preview.token,
        'duplicate_delete',
        new Date('2026-07-24T11:01:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('rejects expired and differently-owned tokens before any Paperless call', async () => {
    const expired = createDuplicateDeletionPlan(handle.db, ['changed-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const expiredClient = { deleteDocument: vi.fn() };
    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: expired.token },
        },
        vi.fn(),
        expiredClient,
        new Date('2026-07-24T11:15:00.000Z'),
      ),
    ).rejects.toMatchObject({ reason: 'expired' } satisfies Partial<MutationPlanError>);
    expect(expiredClient.deleteDocument).not.toHaveBeenCalled();

    const singleUse = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    claimDuplicateDeletionPlan(
      handle.db,
      singleUse.token,
      'different-job',
      new Date('2026-07-24T12:01:00.000Z'),
    );
    const reuseClient = { deleteDocument: vi.fn() };
    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: singleUse.token },
        },
        vi.fn(),
        reuseClient,
        new Date('2026-07-24T12:02:00.000Z'),
      ),
    ).rejects.toMatchObject({ reason: 'claimed' } satisfies Partial<MutationPlanError>);
    expect(reuseClient.deleteDocument).not.toHaveBeenCalled();
  });

  it('resumes after a crash following the remote delete and reconciles archive and audit once', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'review-worker-crash-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'worker.sqlite');
    const first = createDatabaseWithHandle(databasePath);
    await migrateDatabase(first.sqlite);
    seedGroup(first.db, 'crash-group', 'crash-primary', 501, 'crash-duplicate', 502);
    first.db
      .insert(operationLease)
      .values({
        id: 'crash-lease',
        operation: 'duplicate_delete',
        ownerId: 'crash-job',
        acquiredAt: '2026-07-24T11:00:00.000Z',
      })
      .run();
    const preview = createDuplicateDeletionPlan(first.db, ['crash-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const firstClient = { deleteDocument: vi.fn().mockResolvedValue(undefined) };

    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: first.db,
          sqlite: first.sqlite,
          jobId: 'crash-job',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        firstClient,
        new Date('2026-07-24T11:01:00.000Z'),
        {
          afterRemoteDelete: () => {
            throw new Error('simulated process crash');
          },
        },
      ),
    ).rejects.toThrow('simulated process crash');
    expect(firstClient.deleteDocument).toHaveBeenCalledOnce();
    first.sqlite.close();

    const resumed = createDatabaseWithHandle(databasePath);
    const retryClient = {
      deleteDocument: vi
        .fn()
        .mockRejectedValue(new PaperlessApiError('Not found', 404, 'sensitive body')),
    };
    const result = await executeReviewedDuplicateDeletion(
      {
        db: resumed.db,
        sqlite: resumed.sqlite,
        jobId: 'crash-job',
        taskData: { planToken: preview.token },
      },
      vi.fn(),
      retryClient,
      new Date('2026-07-24T11:02:00.000Z'),
    );

    expect(retryClient.deleteDocument).toHaveBeenCalledWith(502);
    expect(result).toMatchObject({
      deletedDocuments: 1,
      alreadyMissingDocuments: 1,
      deletedGroups: 1,
      conflicts: [],
      errors: [],
    });
    expect(
      resumed.sqlite
        .prepare(
          `SELECT status, archived_member_count AS archivedMemberCount
           FROM duplicate_group WHERE id = 'crash-group'`,
        )
        .get(),
    ).toEqual({ status: 'deleted', archivedMemberCount: 2 });
    expect(
      resumed.sqlite
        .prepare(
          `SELECT cumulative_documents_deleted AS documentsDeleted,
                  cumulative_groups_actioned AS groupsActioned
           FROM sync_state WHERE id = 'singleton'`,
        )
        .get(),
    ).toEqual({ documentsDeleted: 1, groupsActioned: 1 });

    const replayClient = { deleteDocument: vi.fn() };
    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: resumed.db,
          sqlite: resumed.sqlite,
          jobId: 'crash-job',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        replayClient,
        new Date('2026-07-24T11:03:00.000Z'),
      ),
    ).resolves.toEqual(result);
    expect(replayClient.deleteDocument).not.toHaveBeenCalled();
    expect(
      resumed.sqlite
        .prepare(
          `SELECT cumulative_documents_deleted AS documentsDeleted,
                  cumulative_groups_actioned AS groupsActioned
           FROM sync_state WHERE id = 'singleton'`,
        )
        .get(),
    ).toEqual({ documentsDeleted: 1, groupsActioned: 1 });
    resumed.sqlite.close();
  });

  it('classifies connection failures as retryable and lets the same job resume manually', async () => {
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const disconnected = {
      deleteDocument: vi
        .fn()
        .mockRejectedValue(
          new PaperlessConnectionError('Connection failed', new Error('ECONNRESET')),
        ),
    };

    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        disconnected,
        new Date('2026-07-24T11:01:00.000Z'),
      ),
    ).rejects.toMatchObject({ retryable: true });

    const recovered = { deleteDocument: vi.fn().mockResolvedValue(undefined) };
    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        recovered,
        new Date('2026-07-24T11:02:00.000Z'),
      ),
    ).resolves.toMatchObject({ deletedDocuments: 1, deletedGroups: 1 });
    expect(recovered.deleteDocument).toHaveBeenCalledOnce();
  });

  it('durably reconciles an earlier document when a later remote delete fails', async () => {
    handle.db
      .insert(document)
      .values({
        id: 'doc-5',
        paperlessId: 203,
        title: 'Second stable duplicate',
        syncedAt: '2026-07-24T09:00:00.000Z',
      })
      .run();
    handle.db
      .insert(duplicateMember)
      .values({
        id: 'stable-group-second-duplicate-member',
        groupId: 'stable-group',
        documentId: 'doc-5',
        isPrimary: false,
      })
      .run();
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now: new Date('2026-07-24T11:00:00.000Z'),
    });
    const firstAttempt = {
      deleteDocument: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new PaperlessConnectionError('Connection failed', new Error('ECONNRESET')),
        ),
    };

    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        firstAttempt,
        new Date('2026-07-24T11:01:00.000Z'),
      ),
    ).rejects.toMatchObject({ retryable: true });
    expect(firstAttempt.deleteDocument.mock.calls).toEqual([[202], [203]]);
    expect(handle.db.select().from(document).where(eq(document.id, 'doc-4')).get()).toBeUndefined();
    expect(
      handle.db
        .select({ status: duplicateGroup.status })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.id, 'stable-group'))
        .get()?.status,
    ).toBe('pending');

    const resumed = { deleteDocument: vi.fn().mockResolvedValue(undefined) };
    await expect(
      executeReviewedDuplicateDeletion(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'job-1',
          taskData: { planToken: preview.token },
        },
        vi.fn(),
        resumed,
        new Date('2026-07-24T11:02:00.000Z'),
      ),
    ).resolves.toMatchObject({ deletedDocuments: 2, deletedGroups: 1 });
    expect(resumed.deleteDocument.mock.calls).toEqual([[203]]);
    expect(
      handle.sqlite
        .prepare(
          `SELECT archived_member_count AS archivedMemberCount
           FROM duplicate_group WHERE id = 'stable-group'`,
        )
        .get(),
    ).toEqual({ archivedMemberCount: 3 });
    expect(
      handle.sqlite
        .prepare(
          `SELECT cumulative_documents_deleted AS documentsDeleted,
                  cumulative_groups_actioned AS groupsActioned
           FROM sync_state WHERE id = 'singleton'`,
        )
        .get(),
    ).toEqual({ documentsDeleted: 2, groupsActioned: 1 });
  });
});
