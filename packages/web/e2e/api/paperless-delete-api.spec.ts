import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

function rows(sqlite: Database.Database, localId: string) {
  return Object.fromEntries(
    [
      'document',
      'document_content',
      'document_signature',
      'ai_processing_result',
      'duplicate_member',
    ].map((table) => [
      table,
      sqlite
        .prepare(`SELECT * FROM ${table} WHERE ${table === 'document' ? 'id' : 'document_id'} = ?`)
        .all(localId),
    ]),
  );
}

function deletedCount(sqlite: Database.Database): number {
  return (
    sqlite
      .prepare('SELECT cumulative_documents_deleted AS value FROM sync_state WHERE id = ?')
      .get('singleton') as { value: number }
  ).value;
}

test.describe('Single Paperless delete', () => {
  let localId: string;
  test.beforeEach(async ({ seedDB }) => {
    localId = seedDB().documentIds[1];
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
    const sqlite = new Database(DB_PATH);
    try {
      sqlite
        .prepare(
          'INSERT INTO document_signature (id, document_id, algorithm_version, num_permutations, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('delete-signature', localId, 'test', 256, new Date().toISOString());
      sqlite
        .prepare(
          'INSERT INTO ai_processing_result (id, document_id, paperless_id, provider, model, applied_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'delete-ai-result',
          localId,
          2,
          'openai',
          'test-model',
          'pending_review',
          new Date().toISOString(),
        );
    } finally {
      sqlite.close();
    }
  });
  test.afterEach(async ({ clearDB }) => {
    clearDB();
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
  });

  for (const alreadyMissing of [false, true]) {
    test(`DELETE removes every local row when alreadyMissing is ${alreadyMissing}`, async ({
      request,
    }) => {
      if (alreadyMissing) {
        const removed = await fetch('http://localhost:18923/api/documents/2/', {
          method: 'DELETE',
          headers: { Authorization: 'Token test-token-e2e' },
        });
        expect(removed.status).toBe(204);
      }
      const sqlite = new Database(DB_PATH);
      try {
        const count = deletedCount(sqlite);
        const response = await request.delete('/api/v1/paperless/documents/2');
        expect(response.status()).toBe(200);
        expect((await request.get(`/api/v1/documents/${localId}`)).status()).toBe(404);
        expect((await response.json()).data).toEqual({ deleted: true, alreadyMissing });
        expect(rows(sqlite, localId)).toEqual({
          document: [],
          document_content: [],
          document_signature: [],
          ai_processing_result: [],
          duplicate_member: [],
        });
        expect(deletedCount(sqlite)).toBe(count + (alreadyMissing ? 0 : 1));
      } finally {
        sqlite.close();
      }
    });
  }

  test('upstream failure leaves every local row and the counter unchanged', async ({ request }) => {
    await fetch('http://localhost:18923/__control__/fail-deletes', { method: 'POST' });
    const sqlite = new Database(DB_PATH);
    try {
      const before = rows(sqlite, localId);
      const count = deletedCount(sqlite);
      const response = await request.delete('/api/v1/paperless/documents/2');
      expect(response.status()).toBe(502);
      expect((await response.json()).error.code).toBe('BAD_GATEWAY');
      expect(rows(sqlite, localId)).toEqual(before);
      expect(deletedCount(sqlite)).toBe(count);
    } finally {
      sqlite.close();
    }
  });
});
