import { describe, expect, it } from 'vitest';
import { selectPrimary } from '../primary.js';

describe('selectPrimary', () => {
  it('chooses the lowest Paperless id without changing member order', () => {
    const members = [
      { id: 'second', paperlessId: 20 },
      { id: 'first', paperlessId: 10 },
    ];
    expect(selectPrimary(members, 'lowest_id')).toEqual({
      documentId: 'first',
      reason: 'Lowest Paperless id',
    });
    expect(members.map((member) => member.id)).toEqual(['second', 'first']);
  });
});

it('uses added time, text size or non-empty metadata categories with id ties', () => {
  const members = [
    {
      id: 'low',
      paperlessId: 10,
      addedDate: '2024-02-01T00:00:00Z',
      wordCount: 10,
      correspondent: null,
      documentType: null,
      tagsJson: '[]',
      customFieldsJson: '[]',
    },
    {
      id: 'old',
      paperlessId: 20,
      addedDate: '2024-01-01T00:00:00Z',
      wordCount: 20,
      correspondent: 'Synthetic',
      documentType: 'Invoice',
      tagsJson: '["one"]',
      customFieldsJson: '[{"field":1,"value":false}]',
    },
    {
      id: 'new',
      paperlessId: 30,
      addedDate: '2024-03-01T00:00:00Z',
      wordCount: 30,
      correspondent: '',
      documentType: '',
      tagsJson: '["one","two","three","four"]',
      customFieldsJson: '[]',
    },
  ];
  expect(selectPrimary(members, 'oldest_added')).toEqual({
    documentId: 'old',
    reason: 'Oldest added date',
  });
  expect(selectPrimary(members, 'newest_added')).toEqual({
    documentId: 'new',
    reason: 'Newest added date',
  });
  expect(selectPrimary(members, 'most_text')).toEqual({
    documentId: 'new',
    reason: 'Highest word count',
  });
  expect(selectPrimary(members, 'most_metadata')).toEqual({
    documentId: 'old',
    reason: 'Most non-empty metadata categories',
  });
  for (const strategy of [
    'lowest_id',
    'oldest_added',
    'newest_added',
    'most_text',
    'most_metadata',
  ] as const) {
    expect(
      selectPrimary([members[1], { ...members[1], id: 'tie', paperlessId: 5 }], strategy)
        .documentId,
    ).toBe('tie');
  }
  expect(
    selectPrimary([{ id: 'missing', paperlessId: 1, addedDate: null }, ...members], 'oldest_added')
      .documentId,
  ).toBe('old');
  expect(
    selectPrimary(
      [{ id: 'invalid', paperlessId: 1, addedDate: 'invalid' }, ...members],
      'newest_added',
    ).documentId,
  ).toBe('new');
  expect(
    selectPrimary(
      [{ id: 'invalid', paperlessId: 1, tagsJson: 'broken', customFieldsJson: '{}' }, ...members],
      'most_metadata',
    ).documentId,
  ).toBe('old');
  expect(() => selectPrimary([], 'lowest_id')).toThrow(RangeError);
});

it('uses the stored strategy only for newly created groups and preserves the default', async () => {
  const { createDatabaseWithHandle } = await import('../../db/client.js');
  const { migrateDatabase } = await import('../../db/migrate.js');
  const { document, documentContent } = await import('../../schema/sqlite/documents.js');
  const { duplicateMember } = await import('../../schema/sqlite/duplicates.js');
  const { setDedupConfig, getDedupConfig } = await import('../config.js');
  const { runAnalysis } = await import('../analyze.js');
  const { eq } = await import('drizzle-orm');
  for (const strategy of ['lowest_id', 'newest_added'] as const) {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    try {
      await migrateDatabase(sqlite);
      if (strategy !== 'lowest_id') setDedupConfig(db, { primaryStrategy: strategy });
      const text = Array.from({ length: 100 }, (_, i) => `syntheticword${i}`).join(' ');
      for (const [paperlessId, addedDate] of [
        [20, '2024-03-01'],
        [10, '2024-01-01'],
      ] as const) {
        const { id } = db
          .insert(document)
          .values({ paperlessId, title: 'Synthetic duplicate', addedDate, syncedAt: '2024-04-01' })
          .returning()
          .get();
        db.insert(documentContent)
          .values({ documentId: id, normalizedText: text, wordCount: 100 })
          .run();
      }
      await runAnalysis(db, { force: true });
      const primary = () =>
        db
          .select({ id: document.paperlessId })
          .from(duplicateMember)
          .innerJoin(document, eq(document.id, duplicateMember.documentId))
          .where(eq(duplicateMember.isPrimary, true))
          .all();
      expect(primary()).toEqual([{ id: strategy === 'lowest_id' ? 10 : 20 }]);
      expect(getDedupConfig(db).primaryStrategy).toBe(strategy);
      setDedupConfig(db, {
        primaryStrategy: strategy === 'lowest_id' ? 'newest_added' : 'lowest_id',
      });
      await runAnalysis(db, { force: true });
      expect(primary()).toEqual([{ id: strategy === 'lowest_id' ? 10 : 20 }]);
    } finally {
      sqlite.close();
    }
  }
});
