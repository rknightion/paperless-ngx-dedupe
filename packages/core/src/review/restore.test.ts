import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';
import { PaperlessClient } from '../paperless/client.js';
import { PaperlessApiError } from '../paperless/errors.js';
import {
  acquireOperation,
  enqueueManualOperation,
  OperationConflictError,
} from '../scheduler/coordinator.js';
import { listCompletedDeletionRuns, restoreDeletionRun } from './restore.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
});
afterEach(() => {
  vi.restoreAllMocks();
  handle.sqlite.close();
});

function plan(
  id: string,
  operation = 'duplicate_delete',
  completedAt: string | null = '2026-01-02T00:00:00.000Z',
) {
  handle.sqlite
    .prepare(
      'INSERT INTO reviewed_mutation_plan (id,token_hash,operation,expires_at,payload_json,completed_at) VALUES (?,?,?,?,?,?)',
    )
    .run(id, id, operation, '2026-01-01T00:00:00.000Z', '{}', completedAt);
}
function group(planId: string, id: string, ordinal: number) {
  handle.sqlite
    .prepare(
      "INSERT INTO reviewed_mutation_group_checkpoint (plan_id,group_id,ordinal,status) VALUES (?,?,?,'completed')",
    )
    .run(planId, id, ordinal);
}
function deletion(
  planId: string,
  groupId: string,
  paperlessId: number,
  ordinal: number,
  outcome = 'deleted',
) {
  handle.sqlite
    .prepare(
      "INSERT INTO reviewed_mutation_document_checkpoint (plan_id,group_id,document_id,paperless_id,ordinal,status,outcome,updated_at) VALUES (?,?,?,?,?,'reconciled',?,?)",
    )
    .run(
      planId,
      groupId,
      `${groupId}-${paperlessId}`,
      paperlessId,
      ordinal,
      outcome,
      '2026-01-02T00:00:00.000Z',
    );
}

it('lists completed deletion runs with stable order and counts only distinct documents actually deleted', () => {
  plan('old');
  group('old', 'old-group', 0);
  deletion('old', 'old-group', 3, 0);
  plan('new', 'duplicate_delete', '2026-01-03T00:00:00.000Z');
  group('new', 'first', 0);
  group('new', 'second', 1);
  deletion('new', 'first', 5, 0);
  deletion('new', 'first', 7, 1, 'already_missing');
  deletion('new', 'second', 5, 0);
  deletion('new', 'second', 9, 1);
  plan('pending', 'duplicate_delete', null);
  plan('unrelated', 'ai_apply');
  expect(listCompletedDeletionRuns(handle.db, 20)).toEqual([
    {
      planId: 'new',
      completedAt: '2026-01-03T00:00:00.000Z',
      documentsDeleted: 2,
      groups: ['first', 'second'],
    },
    {
      planId: 'old',
      completedAt: '2026-01-02T00:00:00.000Z',
      documentsDeleted: 1,
      groups: ['old-group'],
    },
  ]);
  expect(listCompletedDeletionRuns(handle.db, 1).map((run) => run.planId)).toEqual(['new']);
});

function fixture(ids: number[]) {
  plan('run');
  group('run', 'history', 0);
  ids.forEach((id, index) => deletion('run', 'history', id, index));
  handle.sqlite
    .prepare(
      "INSERT INTO duplicate_group (id,confidence_score,algorithm_version,status,created_at,updated_at) VALUES ('history',0.9,'test','deleted','2024-01-01','2024-01-01')",
    )
    .run();
  acquireOperation(handle.sqlite, 'duplicate_delete', 'restore-job');
  const client = new PaperlessClient({ url: 'https://example.test', token: 'synthetic-token' });
  vi.spyOn(client, 'getTrashDocumentIds').mockImplementation(async function* () {
    yield [...ids, 999];
  });
  vi.spyOn(client, 'restoreFromTrash').mockImplementation(async (selected) => selected);
  vi.spyOn(client, 'getDocument').mockImplementation(async (id) => ({
    id,
    title: 'Synthetic restored document',
    content: 'SYNTHETIC restored content',
    tags: [],
    correspondent: null,
    documentType: null,
    created: '2024-01-01',
    modified: '2024-01-01',
    added: '2024-01-01',
    originalFileName: null,
    archivedFileName: null,
    archiveSerialNumber: null,
    customFields: [],
  }));
  vi.spyOn(client, 'getTags').mockResolvedValue([]);
  vi.spyOn(client, 'getCorrespondents').mockResolvedValue([]);
  vi.spyOn(client, 'getDocumentTypes').mockResolvedValue([]);
  return client;
}
const options = { leaseOwnerId: 'restore-job' };

it('restores only this run and immediately refreshes local documents without changing archived groups', async () => {
  const client = fixture([3, 5]);
  deletion('run', 'history', 7, 2, 'already_missing');
  vi.mocked(client.getTrashDocumentIds).mockImplementation(async function* () {
    yield [3, 999];
  });
  const remote = await client.getDocument(3);
  vi.mocked(client.getDocument).mockImplementation(async (id) => {
    if (id === 5) throw new PaperlessApiError('Missing', 404);
    return { ...remote, id };
  });
  expect(await restoreDeletionRun({ db: handle.db, client }, 'run', options)).toEqual({
    restored: 1,
    notRestorable: 1,
  });
  expect(client.restoreFromTrash).toHaveBeenCalledExactlyOnceWith([3]);
  expect(handle.sqlite.prepare('SELECT paperless_id,title FROM document').all()).toEqual([
    { paperless_id: 3, title: 'Synthetic restored document' },
  ]);
  expect(handle.sqlite.prepare('SELECT full_text FROM document_content').get()).toEqual({
    full_text: 'SYNTHETIC restored content',
  });
  expect(
    handle.sqlite.prepare("SELECT status FROM duplicate_group WHERE id='history'").get(),
  ).toEqual({ status: 'deleted' });
});

it('restores in bounded chunks and fetches reference catalogs only once', async () => {
  const ids = Array.from({ length: 125 }, (_, index) => index + 1);
  const client = fixture(ids);
  expect(await restoreDeletionRun({ db: handle.db, client }, 'run', options)).toEqual({
    restored: 125,
    notRestorable: 0,
  });
  expect(vi.mocked(client.restoreFromTrash).mock.calls).toEqual([
    [ids.slice(0, 100)],
    [ids.slice(100)],
  ]);
  expect(client.getDocument).toHaveBeenCalledTimes(125);
  expect(client.getTags).toHaveBeenCalledTimes(1);
  expect(handle.sqlite.prepare('SELECT COUNT(*) AS count FROM document').get()).toEqual({
    count: 125,
  });
});

it('reports a purged run as nothing to restore and tolerates a bin change before restore', async () => {
  const client = fixture([3, 5]);
  vi.mocked(client.getTrashDocumentIds)
    .mockImplementationOnce(async function* () {
      yield [3, 5, 999];
    })
    .mockImplementation(async function* () {
      yield [3, 999];
    });
  vi.mocked(client.restoreFromTrash).mockRejectedValueOnce(
    new PaperlessApiError('Changed selection', 400),
  );
  const document = await client.getDocument(3);
  vi.mocked(client.getDocument).mockImplementation(async (id) => {
    if (id === 5) throw new PaperlessApiError('Missing', 404);
    return { ...document, id };
  });
  expect(await restoreDeletionRun({ db: handle.db, client }, 'run', options)).toEqual({
    restored: 1,
    notRestorable: 1,
  });
  expect(vi.mocked(client.restoreFromTrash).mock.calls).toEqual([[[3, 5]], [[3]]]);
  vi.mocked(client.restoreFromTrash).mockClear();
  vi.mocked(client.getTrashDocumentIds).mockImplementation(async function* () {
    yield [];
  });
  vi.mocked(client.getDocument).mockRejectedValue(new PaperlessApiError('Purged', 404));
  expect(await restoreDeletionRun({ db: handle.db, client }, 'run', options)).toEqual({
    restored: 0,
    notRestorable: 2,
  });
  expect(client.restoreFromTrash).not.toHaveBeenCalled();
});

it('does not hide unrelated upstream errors or allow a restore outside the mutation lease', async () => {
  const client = fixture([3]);
  const error = new PaperlessApiError('Synthetic validation failure', 400);
  vi.mocked(client.restoreFromTrash).mockRejectedValue(error);
  await expect(restoreDeletionRun({ db: handle.db, client }, 'run', options)).rejects.toBe(error);
  expect(client.getDocument).not.toHaveBeenCalled();
  expect(() =>
    enqueueManualOperation(
      handle.sqlite,
      'duplicate_delete',
      { kind: 'manual' },
      'duplicate_restore',
      { planId: 'run' },
    ),
  ).toThrow(OperationConflictError);
  vi.mocked(client.restoreFromTrash).mockClear();
  await expect(
    restoreDeletionRun({ db: handle.db, client }, 'run', { leaseOwnerId: 'other-job' }),
  ).rejects.toMatchObject({ name: 'OperationLeaseOwnershipError' });
  expect(client.restoreFromTrash).not.toHaveBeenCalled();
});

it('rejects incomplete plans, handles empty runs and repairs local state after an earlier remote restore', async () => {
  const client = fixture([3]);
  plan('pending', 'duplicate_delete', null);
  plan('empty');
  await expect(
    restoreDeletionRun({ db: handle.db, client }, 'pending', options),
  ).rejects.toMatchObject({ name: 'DeletionRunNotFoundError' });
  expect(await restoreDeletionRun({ db: handle.db, client }, 'empty', options)).toEqual({
    restored: 0,
    notRestorable: 0,
  });
  expect(client.getTrashDocumentIds).not.toHaveBeenCalled();
  vi.mocked(client.getTrashDocumentIds).mockImplementation(async function* () {
    yield [];
  });
  expect(await restoreDeletionRun({ db: handle.db, client }, 'run', options)).toEqual({
    restored: 0,
    notRestorable: 1,
  });
  expect(client.restoreFromTrash).not.toHaveBeenCalled();
  expect(handle.sqlite.prepare('SELECT paperless_id FROM document').all()).toEqual([
    { paperless_id: 3 },
  ]);
});
