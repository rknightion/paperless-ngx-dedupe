import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { operationLease } from '../../schema/sqlite/automation.js';
import { job } from '../../schema/sqlite/jobs.js';
import { cancelJob } from '../manager.js';
import {
  claimDuplicateDeletionPlan,
  createDuplicateDeletionPlan,
  getReviewedMutationPlan,
  type MutationPlanError,
} from '../../review/mutation-plans.js';
import { PaperlessApiError, PaperlessConnectionError } from '../../paperless/errors.js';
import { paperlessDocumentSchema, paperlessTagSchema } from '../../paperless/schemas.js';
import { PaperlessClient } from '../../paperless/client.js';
import type { AppDatabase } from '../../db/client.js';
import type { WorkerContext } from '../worker-entry.js';

const mocks = vi.hoisted(() => ({
  runWorkerTask: vi.fn(),
}));

vi.mock(import('../worker-entry.js'), async (importOriginal) => ({
  ...(await importOriginal()),
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

  it('leaves every group document undeleted and marks the group failed when the keeper update fails', async () => {
    const now = new Date('2026-07-24T11:00:00.000Z');
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now,
      mergeMetadata: true,
      inboxTagNames: [],
      customFieldNames: new Map(),
    });
    const client = {
      getDocument: vi.fn(async (id: number) =>
        paperlessDocumentSchema.parse({
          id,
          title: 'Synthetic document',
          created: now.toISOString(),
          modified: now.toISOString(),
          added: now.toISOString(),
          tags: id === 201 ? [1] : [1, 2, 3],
          correspondent: id === 201 ? null : 4,
          document_type: id === 201 ? null : 5,
        }),
      ),
      getTags: vi.fn(async () => [
        paperlessTagSchema.parse({ id: 3, name: 'Inbox', is_inbox_tag: true }),
      ]),
      updateDocument: vi.fn().mockRejectedValue(new PaperlessApiError('Synthetic refusal', 503)),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
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
        client,
        now,
      ),
    ).rejects.toThrow('Paperless duplicate deletion failed');
    expect(client.updateDocument).toHaveBeenCalledWith(201, {
      tags: [1, 2],
      correspondent: 4,
      documentType: 5,
    });
    expect(client.deleteDocument).not.toHaveBeenCalled();
    expect(
      handle.sqlite
        .prepare('SELECT status FROM reviewed_mutation_group_checkpoint WHERE group_id = ?')
        .get('stable-group'),
    ).toEqual({ status: 'failed' });
    expect(
      handle.db
        .select()
        .from(document)
        .all()
        .map((row) => row.paperlessId)
        .sort((a, b) => a - b),
    ).toEqual([101, 102, 201, 202]);
  });

  it('copies live missing metadata once and resumes after an acknowledged remote delete without losing the keeper', async () => {
    const now = new Date('2026-07-24T11:00:00.000Z');
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now,
      mergeMetadata: true,
      inboxTagNames: [],
      customFieldNames: new Map(),
    });
    const remote = new Map<number, Record<string, unknown>>(
      [201, 202].map((id) => [
        id,
        {
          id,
          title: 'Synthetic document',
          created: now.toISOString(),
          modified: now.toISOString(),
          added: now.toISOString(),
          tags: id === 201 ? [1] : [1, 2, 3],
          correspondent: id === 201 ? null : 4,
          document_type: id === 201 ? 9 : 5,
          custom_fields:
            id === 201
              ? [
                  { field: 1, value: false },
                  { field: 2, value: 0 },
                  { field: 3, value: '' },
                  { field: 4, value: null },
                  { field: 5, value: [] },
                  { field: 6, value: 'Keeper reference' },
                ]
              : [
                  { field: 1, value: true },
                  { field: 2, value: 99 },
                  { field: 3, value: 'Filled reference' },
                  { field: 4, value: false },
                  { field: 5, value: [12, 13] },
                  { field: 6, value: 'Other reference' },
                  { field: 7, value: 0 },
                ],
        },
      ]),
    );
    const writes: Array<{ method: string; id: number; body?: unknown }> = [];
    const server = createServer(async (request, response) => {
      const path = new URL(request.url!, 'http://localhost').pathname;
      response.setHeader('Content-Type', 'application/json');
      if (path === '/api/tags/') {
        response.end(
          JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [{ id: 3, name: 'Inbox', is_inbox_tag: true }],
          }),
        );
        return;
      }
      const id = Number(path.split('/')[3]);
      const current = remote.get(id);
      if (!current) {
        response.writeHead(404).end('{}');
        return;
      }
      if (request.method === 'PATCH') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const update = JSON.parse(body);
        writes.push({ method: 'PATCH', id, body: update });
        Object.assign(current, update);
      } else if (request.method === 'DELETE') {
        writes.push({ method: 'DELETE', id });
        remote.delete(id);
        response.writeHead(204).end();
        return;
      }
      response.end(JSON.stringify(current));
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing port');
      const client = new PaperlessClient({
        url: `http://127.0.0.1:${address.port}`,
        token: 'synthetic-token',
        maxRetries: 0,
      });
      const ctx = {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'job-1',
        taskData: { planToken: preview.token },
      };
      await expect(
        executeReviewedDuplicateDeletion(ctx, vi.fn(), client, now, {
          afterRemoteDelete: () => {
            throw new Error('Synthetic crash');
          },
        }),
      ).rejects.toThrow('Synthetic crash');
      expect(writes).toEqual([
        {
          method: 'PATCH',
          id: 201,
          body: {
            tags: [1, 2],
            correspondent: 4,
            custom_fields: [
              { field: 1, value: false },
              { field: 2, value: 0 },
              { field: 3, value: 'Filled reference' },
              { field: 4, value: false },
              { field: 5, value: [12, 13] },
              { field: 6, value: 'Keeper reference' },
              { field: 7, value: 0 },
            ],
          },
        },
        { method: 'DELETE', id: 202 },
      ]);
      await expect(
        executeReviewedDuplicateDeletion(ctx, vi.fn(), client, now),
      ).resolves.toMatchObject({
        deletedDocuments: 1,
        alreadyMissingDocuments: 1,
        deletedGroups: 1,
        errors: [],
      });
      expect(writes).toHaveLength(2);
      expect(remote.get(201)).toMatchObject({ tags: [1, 2], correspondent: 4, document_type: 9 });
      expect(remote.has(202)).toBe(false);
      expect(
        handle.db
          .select()
          .from(document)
          .all()
          .map((row) => row.paperlessId)
          .sort((a, b) => a - b),
      ).toEqual([101, 102, 201]);
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each([
    [201, 0],
    [202, 0],
    [202, 404],
  ])(
    'isolates a metadata fetch failure for document %s with status %s while other groups finish',
    async (failedId, statusCode) => {
      const now = new Date('2026-07-24T11:00:00.000Z');
      const preview = createDuplicateDeletionPlan(handle.db, ['stable-group', 'changed-group'], {
        now,
        mergeMetadata: true,
        inboxTagNames: [],
        customFieldNames: new Map(),
      });
      const client = {
        getTags: vi.fn(async () => []),
        getDocument: vi.fn(async (id: number) => {
          if (id === failedId)
            throw statusCode
              ? new PaperlessApiError('Synthetic missing document', statusCode)
              : new PaperlessConnectionError('Synthetic unavailable document');
          return paperlessDocumentSchema.parse({
            id,
            title: 'Synthetic document',
            created: now.toISOString(),
            modified: now.toISOString(),
            added: now.toISOString(),
          });
        }),
        updateDocument: vi.fn().mockResolvedValue(undefined),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
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
          client,
          now,
        ),
      ).rejects.toMatchObject({ retryable: statusCode !== 404 });
      expect(client.updateDocument).not.toHaveBeenCalled();
      expect(client.deleteDocument.mock.calls).toEqual([[102]]);
      expect(
        handle.sqlite
          .prepare(
            'SELECT group_id, status FROM reviewed_mutation_group_checkpoint ORDER BY group_id',
          )
          .all(),
      ).toEqual([
        { group_id: 'changed-group', status: 'completed' },
        { group_id: 'stable-group', status: 'failed' },
      ]);
      expect(
        handle.db
          .select()
          .from(document)
          .all()
          .map((row) => row.paperlessId)
          .sort((a, b) => a - b),
      ).toEqual([101, 201, 202]);
    },
  );

  it('does not patch the keeper when cancellation arrives during metadata reads', async () => {
    const now = new Date('2026-07-24T11:00:00.000Z');
    handle.db
      .insert(job)
      .values({
        id: 'job-1',
        type: 'duplicate_delete',
        status: 'running',
        createdAt: now.toISOString(),
      })
      .run();
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now,
      mergeMetadata: true,
      inboxTagNames: [],
      customFieldNames: new Map(),
    });
    const client = {
      getTags: vi.fn(async () => []),
      getDocument: vi.fn(async (id: number) => {
        if (id === 202) cancelJob(handle.db, 'job-1');
        return paperlessDocumentSchema.parse({
          id,
          title: 'Synthetic document',
          created: now.toISOString(),
          modified: now.toISOString(),
          added: now.toISOString(),
          tags: id === 201 ? [] : [2],
        });
      }),
      updateDocument: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
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
        client,
        now,
      ),
    ).rejects.toThrow('Job was cancelled');
    expect(client.updateDocument).not.toHaveBeenCalled();
    expect(client.deleteDocument).not.toHaveBeenCalled();
    expect(
      handle.sqlite
        .prepare('SELECT status FROM reviewed_mutation_group_checkpoint WHERE group_id = ?')
        .get('stable-group'),
    ).toEqual({ status: 'in_progress' });
  });

  it('leaves the group undeleted when a custom-field-only update fails', async () => {
    const now = new Date('2026-07-24T11:00:00.000Z');
    const preview = createDuplicateDeletionPlan(handle.db, ['stable-group'], {
      now,
      mergeMetadata: true,
      inboxTagNames: [],
      customFieldNames: new Map(),
    });
    const client = {
      getTags: vi.fn(async () => []),
      getDocument: vi.fn(async (id: number) =>
        paperlessDocumentSchema.parse({
          id,
          title: 'Synthetic document',
          created: now.toISOString(),
          modified: now.toISOString(),
          added: now.toISOString(),
          custom_fields: id === 201 ? [] : [{ field: 7, value: 'Synthetic reference' }],
        }),
      ),
      updateDocument: vi.fn().mockRejectedValue(new PaperlessApiError('Synthetic refusal', 503)),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
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
        client,
        now,
      ),
    ).rejects.toThrow('Paperless duplicate deletion failed');
    expect(client.updateDocument).toHaveBeenCalledWith(201, {
      customFields: [{ field: 7, value: 'Synthetic reference' }],
    });
    expect(
      handle.sqlite
        .prepare('SELECT status FROM reviewed_mutation_group_checkpoint WHERE group_id = ?')
        .get('stable-group'),
    ).toEqual({ status: 'failed' });
    expect(client.deleteDocument).not.toHaveBeenCalled();
    expect(
      handle.db
        .select()
        .from(document)
        .all()
        .map(({ paperlessId }) => paperlessId)
        .sort((a, b) => a - b),
    ).toEqual([101, 102, 201, 202]);
  });

  it.each(['between groups', 'within a group'] as const)(
    'does not issue another remote deletion after cancellation %s',
    async (boundary) => {
      handle.db
        .insert(job)
        .values({
          id: 'job-1',
          type: 'batch_operation',
          status: 'running',
          createdAt: '2026-07-24T11:00:00.000Z',
        })
        .run();
      if (boundary === 'within a group') {
        handle.db
          .insert(document)
          .values({
            id: 'doc-5',
            paperlessId: 203,
            title: 'Synthetic third document',
            syncedAt: '2026-07-24T09:00:00.000Z',
          })
          .run();
        handle.db
          .insert(duplicateMember)
          .values({
            id: 'second-duplicate',
            groupId: 'stable-group',
            documentId: 'doc-5',
            isPrimary: false,
          })
          .run();
      }
      const preview = createDuplicateDeletionPlan(
        handle.db,
        boundary === 'between groups' ? ['changed-group', 'stable-group'] : ['stable-group'],
        { now: new Date('2026-07-24T11:00:00.000Z') },
      );
      let cancelled = false;
      let deletionsAfterCancel = 0;
      const client = {
        deleteDocument: vi.fn(async () => {
          if (cancelled) deletionsAfterCancel++;
        }),
      };
      const outcome = await executeReviewedDuplicateDeletion(
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
          afterRemoteDelete: () => {
            if (!cancelled) cancelled = cancelJob(handle.db, 'job-1');
          },
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(cancelled).toBe(true);
      expect(deletionsAfterCancel).toBe(0);
      expect(client.deleteDocument).toHaveBeenCalledOnce();
      expect(outcome).toMatchObject({ name: 'CancellationError' });
      const untouchedId = boundary === 'between groups' ? 'doc-4' : 'doc-5';
      expect(
        handle.db.select().from(document).where(eq(document.id, untouchedId)).get(),
      ).toBeDefined();
    },
  );

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
    expect(result.planId).toBe(
      (
        handle.sqlite
          .prepare('SELECT id FROM reviewed_mutation_plan WHERE claimed_by_job_id=?')
          .get('job-1') as { id: string }
      ).id,
    );
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
