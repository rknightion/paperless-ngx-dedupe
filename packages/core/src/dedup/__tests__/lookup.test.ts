import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { normalizeText } from '../../sync/normalize.js';
import { runAnalysis } from '../analyze.js';
import {
  SimilarDocumentValidationError,
  SimilarDocumentNotFoundError,
  findSimilarDocuments,
} from '../lookup.js';

it('finds an identical stored document first without writing or returning the id source itself', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    const text = Array.from({ length: 45 }, (_, index) => `synthetic${index}`).join(' ');
    for (const [id, content] of [
      [1, text],
      [2, `${text} extra words`],
      [3, Array.from({ length: 45 }, (_, index) => `different${index}`).join(' ')],
    ] as const) {
      db.insert(document)
        .values({
          id: `doc-${id}`,
          paperlessId: id,
          title: `Synthetic document ${id}`,
          syncedAt: '2026-01-01',
        })
        .run();
      const normalized = normalizeText(content);
      db.insert(documentContent)
        .values({ documentId: `doc-${id}`, fullText: content, ...normalized })
        .run();
    }
    await runAnalysis(db);
    const before = sqlite.prepare('SELECT total_changes() AS count').get();
    const byText = findSimilarDocuments(db, { text: text.toUpperCase(), limit: 1 });
    expect(byText).toEqual({
      data: [{ documentId: 'doc-1', paperlessId: 1, title: 'Synthetic document 1', jaccard: 1 }],
      compared: 3,
    });
    const byId = findSimilarDocuments(db, { paperlessId: 1, limit: 2, minSimilarity: 0.5 });
    expect(byId.compared).toBe(2);
    expect(byId.data.map((result) => result.paperlessId)).toEqual([2]);
    expect(byId.data[0].jaccard).toBeGreaterThanOrEqual(0.5);
    expect(sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(before);
  } finally {
    sqlite.close();
  }
});

it('orders a streamed set by score, applies the requested limit and ignores incompatible signatures', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (let id = 1; id <= 66; id++) {
      const size = id === 66 ? 32 : 64;
      const values = new Uint32Array(size).fill(1);
      values.fill(0, 0, id === 65 ? 64 : id);
      sqlite
        .prepare(
          "INSERT INTO document (id, paperless_id, title, synced_at) VALUES (?, ?, 'Synthetic document', '2026-01-01')",
        )
        .run(`rank-${id}`, id);
      sqlite
        .prepare(
          "INSERT INTO document_signature (id, document_id, minhash_signature, algorithm_version, num_permutations, created_at) VALUES (?, ?, ?, 'synthetic', ?, '2026-01-01')",
        )
        .run(`sig-${id}`, `rank-${id}`, Buffer.from(values.buffer), size);
    }
    const result = findSimilarDocuments(db, { paperlessId: 65, minSimilarity: 0.5, limit: 3 });
    expect(result.compared).toBe(64);
    expect(result.data.map(({ paperlessId, jaccard }) => ({ paperlessId, jaccard }))).toEqual([
      { paperlessId: 64, jaccard: 1 },
      { paperlessId: 63, jaccard: 63 / 64 },
      { paperlessId: 62, jaccard: 62 / 64 },
    ]);
    expect(
      findSimilarDocuments(db, { paperlessId: 65, minSimilarity: 1 }).data.map(
        (row) => row.paperlessId,
      ),
    ).toEqual([64]);
  } finally {
    sqlite.close();
  }
});

it('rejects short text, invalid bounds and unprocessed ids without writing', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    const before = sqlite.prepare('SELECT total_changes() AS count').get();
    expect(() => findSimilarDocuments(db, { text: 'too short' })).toThrow(
      SimilarDocumentValidationError,
    );
    expect(() => findSimilarDocuments(db, { paperlessId: 999 })).toThrow(
      SimilarDocumentNotFoundError,
    );
    for (const input of [
      { text: 'x'.repeat(500_001) },
      { paperlessId: 1, limit: 51 },
      { paperlessId: 1, limit: 0 },
      { paperlessId: 1, minSimilarity: 1.1 },
      { paperlessId: 1, minSimilarity: -0.1 },
      { paperlessId: 1, text: 'ambiguous' },
    ])
      expect(() => findSimilarDocuments(db, input)).toThrow();
    expect(sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(before);
  } finally {
    sqlite.close();
  }
});
