import { test, expect, DB_PATH } from '../fixtures/test-app';
import Database from 'better-sqlite3';

test('similar lookup returns ranked stored signatures and validation errors without mutations', async ({
  request,
  seedDB,
  clearDB,
}) => {
  const seed = seedDB();
  const db = new Database(DB_PATH);
  try {
    const signature = Buffer.from(new Uint32Array(256).fill(42).buffer);
    for (const id of seed.documentIds.slice(0, 2)) {
      db.prepare(
        "INSERT INTO document_signature (id, document_id, minhash_signature, algorithm_version, num_permutations, created_at) VALUES (?, ?, ?, 'synthetic', 256, '2026-01-01')",
      ).run(`signature-${id}`, id, signature);
    }
    const before = db.prepare('SELECT count(*) AS total FROM duplicate_group').get();
    const response = await request.post('/api/v1/documents/similar', { data: { paperlessId: 1 } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { documentId: seed.documentIds[1], paperlessId: 2, title: 'Test Document 2', jaccard: 1 },
      ],
      meta: { compared: 1 },
    });
    for (const data of [
      { text: 'too short' },
      { text: 'short', paperlessId: 1 },
      { paperlessId: 1, limit: 51 },
    ]) {
      const invalid = await request.post('/api/v1/documents/similar', { data });
      expect(invalid.status()).toBe(400);
      expect((await invalid.json()).error.code).toBe('VALIDATION_FAILED');
    }
    const missing = await request.post('/api/v1/documents/similar', { data: { paperlessId: 3 } });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error).toMatchObject({
      code: 'NOT_FOUND',
      validationIssues: [
        { path: ['paperlessId'], message: 'Analysis has not processed this document yet' },
      ],
    });
    expect(db.prepare('SELECT count(*) AS total FROM duplicate_group').get()).toEqual(before);
  } finally {
    db.close();
    clearDB();
  }
});
