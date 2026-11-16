import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { PaperlessClient } from '../../paperless/client.js';
import { acquireOperation } from '../../scheduler/coordinator.js';
import { type TaskFunction } from '../worker-entry.js';

const capture = vi.hoisted(() => ({ runWorkerTask: vi.fn() }));
vi.mock('../worker-entry.js', () => ({ runWorkerTask: capture.runWorkerTask }));
vi.mock('../../index.js', async () => ({
  PaperlessClient: (await import('../../paperless/client.js')).PaperlessClient,
  parseConfig: () => ({}),
  toPaperlessConfig: () => ({ url: 'https://example.test', token: 'synthetic-token' }),
}));
let task: TaskFunction;
let handle: ReturnType<typeof createDatabaseWithHandle>;
beforeAll(async () => {
  await import('./sync-worker.js');
  task = capture.runWorkerTask.mock.calls[0][0] as TaskFunction;
});
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
  acquireOperation(handle.sqlite, 'sync', 'selected-sync');
  handle.sqlite
    .prepare("INSERT INTO sync_state (id,last_sync_at) VALUES ('singleton','2026-01-01')")
    .run();
  vi.spyOn(PaperlessClient.prototype, 'getTags').mockResolvedValue([]);
  vi.spyOn(PaperlessClient.prototype, 'getCorrespondents').mockResolvedValue([]);
  vi.spyOn(PaperlessClient.prototype, 'getDocumentTypes').mockResolvedValue([]);
  vi.spyOn(PaperlessClient.prototype, 'getDocuments').mockImplementation(() => {
    throw new Error('No document list scan permitted');
  });
  vi.spyOn(PaperlessClient.prototype, 'getDocumentIds').mockImplementation(() => {
    throw new Error('No inventory scan permitted');
  });
  vi.spyOn(PaperlessClient.prototype, 'getDocument').mockImplementation(async (id) => ({
    id,
    title: `Synthetic ${id}`,
    content: 'Synthetic refreshed text',
    tags: [],
    correspondent: null,
    documentType: null,
    created: '2024-01-01',
    modified: '2024-01-01',
    added: '2024-01-01',
    originalFileName: null,
    archivedFileName: null,
    archiveSerialNumber: null,
    pageCount: null,
    mimeType: null,
    customFields: [],
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  handle.sqlite.close();
});
it('refreshes webhook-selected documents without a list or inventory scan', async () => {
  const result = await task(
    {
      db: handle.db,
      sqlite: handle.sqlite,
      jobId: 'selected-sync',
      taskData: { paperlessIds: [3, 5] },
    },
    vi.fn(),
  );
  expect(result).toMatchObject({ inserted: 2, updated: 0, skipped: 0, failed: 0 });
  expect(
    handle.sqlite.prepare('SELECT paperless_id,title FROM document ORDER BY paperless_id').all(),
  ).toEqual([
    { paperless_id: 3, title: 'Synthetic 3' },
    { paperless_id: 5, title: 'Synthetic 5' },
  ]);
  expect(PaperlessClient.prototype.getDocument).toHaveBeenCalledTimes(2);
  expect(PaperlessClient.prototype.getDocuments).not.toHaveBeenCalled();
  expect(PaperlessClient.prototype.getDocumentIds).not.toHaveBeenCalled();
  expect(handle.sqlite.prepare('SELECT last_sync_at FROM sync_state').get()).toEqual({
    last_sync_at: '2026-01-01',
  });
});
