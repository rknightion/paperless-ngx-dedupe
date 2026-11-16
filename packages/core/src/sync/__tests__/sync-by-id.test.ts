import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { PaperlessClient } from '../../paperless/client.js';
import { PaperlessApiError } from '../../paperless/errors.js';
import { type PaperlessDocument } from '../../paperless/types.js';
import { syncDocumentsById } from '../sync-documents.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
let client: PaperlessClient;
let remote: PaperlessDocument;
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
  client = new PaperlessClient({ url: 'https://example.test', token: 'synthetic-token' });
  remote = {
    id: 3,
    title: 'Restored document',
    content: 'SYNTHETIC restored text',
    tags: [1],
    correspondent: 2,
    documentType: 4,
    created: '2024-01-01',
    modified: '2024-01-01',
    added: '2024-01-01',
    originalFileName: 'synthetic.pdf',
    archivedFileName: null,
    archiveSerialNumber: 9,
    pageCount: 2,
    mimeType: 'application/pdf',
    customFields: [],
  };
  vi.spyOn(client, 'getDocument').mockImplementation(async (id) => ({ ...remote, id }));
  vi.spyOn(client, 'getTags').mockResolvedValue([{ id: 1, name: 'Synthetic tag' }] as never);
  vi.spyOn(client, 'getCorrespondents').mockResolvedValue([
    { id: 2, name: 'Synthetic sender' },
  ] as never);
  vi.spyOn(client, 'getDocumentTypes').mockResolvedValue([
    { id: 4, name: 'Synthetic type' },
  ] as never);
  vi.spyOn(client, 'getDocuments').mockImplementation(() => {
    throw new Error('No library scan permitted');
  });
  vi.spyOn(client, 'getDocumentIds').mockImplementation(() => {
    throw new Error('No inventory scan permitted');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  handle.sqlite.close();
});

it('refreshes only selected IDs including old modified timestamps and preserves the sync cursor', async () => {
  handle.sqlite
    .prepare(
      "INSERT INTO sync_state (id,last_sync_at) VALUES ('singleton','2026-01-01') ON CONFLICT(id) DO UPDATE SET last_sync_at='2026-01-01'",
    )
    .run();
  expect(await syncDocumentsById({ db: handle.db, client }, [3, 5, 3])).toEqual({
    inserted: 2,
    updated: 0,
    notFound: [],
  });
  expect(vi.mocked(client.getDocument).mock.calls).toEqual([[3], [5]]);
  expect(client.getTags).toHaveBeenCalledTimes(1);
  expect(
    handle.sqlite
      .prepare(
        'SELECT paperless_id,title,correspondent,document_type,tags_json,modified_date FROM document ORDER BY paperless_id',
      )
      .all(),
  ).toEqual(
    [3, 5].map((id) => ({
      paperless_id: id,
      title: 'Restored document',
      correspondent: 'Synthetic sender',
      document_type: 'Synthetic type',
      tags_json: '["Synthetic tag"]',
      modified_date: '2024-01-01',
    })),
  );
  expect(handle.sqlite.prepare('SELECT normalized_text FROM document_content').all()).toEqual([
    { normalized_text: 'synthetic restored text' },
    { normalized_text: 'synthetic restored text' },
  ]);
  expect(handle.sqlite.prepare('SELECT last_sync_at FROM sync_state').get()).toEqual({
    last_sync_at: '2026-01-01',
  });
  remote.content = 'Changed synthetic text';
  expect(await syncDocumentsById({ db: handle.db, client }, [3])).toEqual({
    inserted: 0,
    updated: 1,
    notFound: [],
  });
  expect(
    handle.sqlite
      .prepare(
        'SELECT normalized_text FROM document_content c JOIN document d ON d.id=c.document_id WHERE d.paperless_id=3',
      )
      .get(),
  ).toEqual({ normalized_text: 'changed synthetic text' });
  expect(client.getDocuments).not.toHaveBeenCalled();
  expect(client.getDocumentIds).not.toHaveBeenCalled();
});

it('reports missing documents and stops before the next read on cancellation', async () => {
  vi.mocked(client.getDocument).mockRejectedValueOnce(new PaperlessApiError('Missing', 404));
  expect(await syncDocumentsById({ db: handle.db, client }, [3])).toEqual({
    inserted: 0,
    updated: 0,
    notFound: [3],
  });
  const cancelled = new Error('Synthetic cancellation');
  await expect(
    syncDocumentsById({ db: handle.db, client }, [5], {
      onProgress: async () => {
        throw cancelled;
      },
    }),
  ).rejects.toBe(cancelled);
  expect(vi.mocked(client.getDocument).mock.calls).toEqual([[3]]);
  expect(handle.sqlite.prepare('SELECT COUNT(*) AS count FROM document').get()).toEqual({
    count: 0,
  });
});
