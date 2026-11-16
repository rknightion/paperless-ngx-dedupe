import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { runAnalysis } from '../analyze.js';
import { setDedupConfig, getDedupConfig } from '../config.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
});
afterEach(() => handle.sqlite.close());

it('excludes tagged documents and cached signatures while removing stale pending groups', async () => {
  const text = Array.from({ length: 100 }, (_, i) => `syntheticword${i}`).join(' ');
  for (const id of [1, 2, 3]) {
    handle.db
      .insert(document)
      .values({
        id: `doc-${id}`,
        paperlessId: id,
        title: 'Synthetic duplicate',
        tagsJson: JSON.stringify(id === 1 ? ['Archive, keep'] : ['ordinary']),
        syncedAt: '2024-01-01',
      })
      .run();
    handle.db
      .insert(documentContent)
      .values({ documentId: `doc-${id}`, normalizedText: text, wordCount: 100 })
      .run();
  }
  const groups = () =>
    handle.sqlite
      .prepare(
        "SELECT d.paperless_id FROM duplicate_member m JOIN duplicate_group g ON g.id=m.group_id JOIN document d ON d.id=m.document_id WHERE g.status='pending' ORDER BY d.paperless_id",
      )
      .all();
  await runAnalysis(handle.db, { force: true });
  expect(groups()).toEqual([{ paperless_id: 1 }, { paperless_id: 2 }, { paperless_id: 3 }]);
  setDedupConfig(handle.db, { excludedTagNames: ['ARCHIVE, KEEP'] });
  const filtered = await runAnalysis(handle.db, { force: true });
  expect(groups()).toEqual([{ paperless_id: 2 }, { paperless_id: 3 }]);
  expect(filtered).toMatchObject({
    totalDocuments: 3,
    documentsAnalyzed: 2,
    documentsSkipped: 1,
    skipReasons: { excludedByTag: 1 },
  });
  expect(getDedupConfig(handle.db).excludedTagNames).toEqual(['ARCHIVE, KEEP']);
  setDedupConfig(handle.db, { excludedTagNames: ['archive, keep', 'ORDINARY'] });
  const excluded = await runAnalysis(handle.db, { force: true });
  expect(groups()).toEqual([]);
  expect(excluded).toMatchObject({
    documentsAnalyzed: 0,
    documentsSkipped: 3,
    skipReasons: { excludedByTag: 3 },
  });
  setDedupConfig(handle.db, { excludedTagNames: [] });
  await runAnalysis(handle.db, { force: true });
  expect(groups()).toEqual([{ paperless_id: 1 }, { paperless_id: 2 }, { paperless_id: 3 }]);
});

it('marks changed exclusions stale without invalidating the empty default hash', async () => {
  const { computeAnalysisConfigHash, saveAnalysisConfigHash, checkAnalysisStaleness } =
    await import('../analysis-hash.js');
  const config = setDedupConfig(handle.db, {
    excludedTagNames: [],
    confidenceWeightFuzzy: 40,
    confidenceWeightJaccard: 60,
    discriminativePenaltyStrength: 70,
    fuzzySampleSize: 10000,
    minWords: 20,
    ngramSize: 3,
    numBands: 32,
    numPermutations: 256,
    similarityThreshold: 0.75,
  });
  // Reference produced by the pre-exclusion algorithm for these fixed settings (algorithm 1.2.0).
  const previousHash = '6ae35288a8f8ef59e84280e3d5dac5047b12723b8b54d5a2abafcc8af758ae36';
  expect(computeAnalysisConfigHash(config)).toBe(previousHash);
  saveAnalysisConfigHash(handle.db, previousHash);
  expect(checkAnalysisStaleness(handle.db).isStale).toBe(false);
  setDedupConfig(handle.db, { excludedTagNames: ['Archive, Keep', 'ordinary'] });
  expect(checkAnalysisStaleness(handle.db).isStale).toBe(true);
  const changed = computeAnalysisConfigHash(getDedupConfig(handle.db));
  saveAnalysisConfigHash(handle.db, changed);
  setDedupConfig(handle.db, { excludedTagNames: ['ORDINARY', 'archive, keep', 'ordinary'] });
  expect(checkAnalysisStaleness(handle.db).isStale).toBe(false);
  setDedupConfig(handle.db, { excludedTagNames: ['archive', 'keep,ordinary'] });
  expect(checkAnalysisStaleness(handle.db).isStale).toBe(true);
  setDedupConfig(handle.db, { excludedTagNames: [] });
  expect(computeAnalysisConfigHash(getDedupConfig(handle.db))).toBe(previousHash);
});

it('keeps excluded cached documents out of incremental matching and preserves reviewed groups', async () => {
  const text = Array.from({ length: 100 }, (_, i) => `syntheticword${i}`).join(' ');
  for (const id of [1, 2]) {
    handle.db
      .insert(document)
      .values({
        id: `doc-${id}`,
        paperlessId: id,
        title: 'Synthetic duplicate',
        tagsJson: JSON.stringify(id === 1 ? ['skip'] : []),
        syncedAt: '2024-01-01',
      })
      .run();
    handle.db
      .insert(documentContent)
      .values({ documentId: `doc-${id}`, normalizedText: text, wordCount: 100 })
      .run();
  }
  await runAnalysis(handle.db, { force: true });
  setDedupConfig(handle.db, { excludedTagNames: ['SKIP'] });
  handle.sqlite
    .prepare("UPDATE document SET processing_status='pending' WHERE paperless_id=2")
    .run();
  const result = await runAnalysis(handle.db);
  expect(result).toMatchObject({
    candidatePairsFound: 0,
    signaturesReused: 1,
    skipReasons: { excludedByTag: 1 },
  });
  expect(handle.sqlite.prepare('SELECT id FROM duplicate_group').all()).toEqual([]);
  setDedupConfig(handle.db, { excludedTagNames: [] });
  await runAnalysis(handle.db, { force: true });
  handle.sqlite.prepare("UPDATE duplicate_group SET status='ignored'").run();
  const before = handle.sqlite.prepare('SELECT * FROM duplicate_group').all();
  setDedupConfig(handle.db, { excludedTagNames: ['skip'] });
  await runAnalysis(handle.db, { force: true });
  expect(handle.sqlite.prepare('SELECT * FROM duplicate_group').all()).toEqual(before);
});

it('preserves exclusion arrays through configuration backup import', async () => {
  const { exportConfig, importConfig } = await import('../../export/config.js');
  setDedupConfig(handle.db, { excludedTagNames: ['Archive, keep', 'Synthetic tag'] });
  const backup = exportConfig(handle.db);
  setDedupConfig(handle.db, { excludedTagNames: [] });
  importConfig(handle.db, backup);
  expect(getDedupConfig(handle.db).excludedTagNames).toEqual(['Archive, keep', 'Synthetic tag']);
  expect(exportConfig(handle.db).dedupConfig.excludedTagNames).toEqual([
    'Archive, keep',
    'Synthetic tag',
  ]);
});
