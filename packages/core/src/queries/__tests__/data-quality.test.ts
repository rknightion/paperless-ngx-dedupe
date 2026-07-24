import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import type { AppDatabase } from '../../db/client.js';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { listDocumentLibrary } from '../documents.js';
import { documentLibraryQuerySchema } from '../types.js';
import {
  getDataQualityInsights,
  normalizeQualityKey,
  normalizeQualityLabel,
  pairNearDuplicateNames,
} from '../data-quality.js';

describe('data-quality helpers', () => {
  function referenceEditDistance(left: string, right: string): number {
    const leftCharacters = Array.from(left);
    const rightCharacters = Array.from(right);
    let previous = Array.from({ length: rightCharacters.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] +
            (leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[rightCharacters.length];
  }

  it('normalizes labels without preserving control characters, punctuation variants, or unsafe length', () => {
    expect(normalizeQualityLabel('  ACME\u0000 & Sons, LTD.  ')).toBe('acme and sons limited');
    expect(normalizeQualityLabel(`A${' very'.repeat(100)} long name`)).toHaveLength(80);
    const sharedPrefix = `organisation ${'界'.repeat(80)}`;
    expect(normalizeQualityKey(`${sharedPrefix} alpha`)).not.toBe(
      normalizeQualityKey(`${sharedPrefix} beta`),
    );
  });

  it('pairs normalized spelling variants deterministically without overlapping groups', () => {
    const entries = [
      { label: 'Northwind Limited', count: 2 },
      { label: 'Northwind Ltd.', count: 3 },
      { label: 'Northwind Limted', count: 1 },
      { label: 'Unrelated', count: 20 },
    ];
    const expected = [
      {
        count: 6,
        label: 'northwind limited',
        variants: ['northwind limited', 'northwind limted'],
        exactVariants: ['Northwind Limited', 'Northwind Limted', 'Northwind Ltd.'],
      },
    ];
    expect(pairNearDuplicateNames(entries, 10)).toEqual(expected);
    expect(pairNearDuplicateNames([...entries].reverse(), 10)).toEqual(expected);
  });

  it.each([
    ['a' + 'b'.repeat(99), 'a' + 'c'.repeat(8) + 'b'.repeat(91)],
    ['a' + 'b'.repeat(99), 'a' + 'c'.repeat(9) + 'b'.repeat(90)],
    ['界' + '文'.repeat(79), '界' + '語'.repeat(6) + '文'.repeat(73)],
    ['界' + '文'.repeat(79), '界' + '語'.repeat(7) + '文'.repeat(72)],
    ['𐐀' + '文'.repeat(79), '𐐀' + '語'.repeat(6) + '文'.repeat(73)],
    ['𐐀' + '文'.repeat(79), '𐐀' + '語'.repeat(7) + '文'.repeat(72)],
    ['a' + 'b'.repeat(79), 'a' + 'b'.repeat(73)],
    ['a' + 'b'.repeat(79), 'a' + 'b'.repeat(72)],
  ])('matches the full Unicode code-point reference at the 0.92 boundary', (left, right) => {
    const normalizedLeft = normalizeQualityKey(left);
    const normalizedRight = normalizeQualityKey(right);
    const longest = Math.max(Array.from(normalizedLeft).length, Array.from(normalizedRight).length);
    const referenceNear =
      normalizedLeft[0] === normalizedRight[0] &&
      Math.min(Array.from(normalizedLeft).length, Array.from(normalizedRight).length) >= 6 &&
      1 - referenceEditDistance(normalizedLeft, normalizedRight) / longest >= 0.92;

    expect(
      pairNearDuplicateNames(
        [
          { label: left, count: 2 },
          { label: right, count: 1 },
        ],
        1,
      ).length > 0,
    ).toBe(referenceNear);
  });

  it('keeps 200 maximum-length dissimilar labels within a bounded edit-cell budget', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      label: `a${String.fromCodePoint(0x4e00 + index).repeat(199)}`,
      count: 200 - index,
    }));
    const work = { comparedPairs: 0, visitedCells: 0 };

    const result = (
      pairNearDuplicateNames as unknown as (
        values: typeof entries,
        limit: number,
        metrics: typeof work,
      ) => ReturnType<typeof pairNearDuplicateNames>
    )(entries, 5, work);

    expect(result).toEqual([]);
    expect(work.comparedPairs).toBe(19_900);
    expect(work.visitedCells).toBeGreaterThan(0);
    expect(work.visitedCells).toBeLessThan(15_000_000);
  });
});

describe('getDataQualityInsights', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns no insights for an empty library', () => {
    expect(getDataQualityInsights(db)).toEqual({ totalDocuments: 0, insights: [] });
  });

  it('treats arrays without usable string tag members as missing tags', () => {
    db.insert(document)
      .values({
        id: 'invalid-tag-members',
        paperlessId: 1,
        title: 'Private',
        tagsJson: '[7,null,""]',
        syncedAt: '2026-01-01T00:00:00Z',
      })
      .run();

    const result = getDataQualityInsights(db);
    const insight = result.insights.find(({ kind }) => kind === 'missing-tags');
    expect(insight).toEqual({
      kind: 'missing-tags',
      count: 1,
      label: 'missing tags',
      url: '/documents?library=true&missingTags=true',
    });
    const url = new URL(insight!.url, 'http://localhost');
    const input = Object.fromEntries(url.searchParams);
    delete input.library;
    expect(listDocumentLibrary(db, documentLibraryQuerySchema.parse(input)).counts.total).toBe(1);
  });

  it('returns deterministic actionable insights for classification, OCR, tags, names, and custom fields', () => {
    db.insert(document)
      .values([
        {
          id: 'doc-1',
          paperlessId: 1,
          title: 'Private title must not leak',
          correspondent: 'Northwind Ltd.',
          documentType: 'Utility Bill',
          tagsJson: '["Inbox","inbox","Shared"]',
          customFieldsJson: '[]',
          syncedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'doc-2',
          paperlessId: 2,
          title: 'Another private title',
          correspondent: 'Northwind Limited',
          documentType: 'Utility-Bill',
          tagsJson: '["inbox"]',
          customFieldsJson: null,
          syncedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'doc-3',
          paperlessId: 3,
          title: 'OCR secret',
          correspondent: null,
          documentType: '',
          tagsJson: '[]',
          customFieldsJson: '[{"field":7,"value":"private-value"}]',
          syncedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'doc-4',
          paperlessId: 4,
          title: 'No metadata',
          correspondent: ' ',
          documentType: null,
          tagsJson: '{malformed',
          customFieldsJson: '{malformed',
          syncedAt: '2026-01-01T00:00:00Z',
        },
      ])
      .run();
    db.insert(documentContent)
      .values([
        {
          id: 'content-1',
          documentId: 'doc-1',
          fullText: 'Account: SECRET-100',
          wordCount: 2,
        },
        {
          id: 'content-2',
          documentId: 'doc-2',
          fullText: 'Reference: SECRET-100',
          wordCount: 2,
        },
        {
          id: 'content-3',
          documentId: 'doc-3',
          fullText: '   ',
          wordCount: 0,
        },
      ])
      .run();

    const first = getDataQualityInsights(db);
    const second = getDataQualityInsights(db);

    expect(second).toEqual(first);
    expect(first.totalDocuments).toBe(4);
    expect(first.insights).toEqual([
      {
        kind: 'missing-correspondent',
        count: 2,
        label: 'missing correspondent',
        url: '/documents?library=true&missingCorrespondent=true',
      },
      {
        kind: 'missing-document-type',
        count: 2,
        label: 'missing document type',
        url: '/documents?library=true&missingDocumentType=true',
      },
      {
        kind: 'missing-tags',
        count: 2,
        label: 'missing tags',
        url: '/documents?library=true&missingTags=true',
      },
      {
        kind: 'ocr-gap',
        count: 2,
        label: 'missing ocr',
        url: '/documents?library=true&missingOcr=true',
      },
      {
        kind: 'overused-tag',
        count: 2,
        label: 'inbox',
        url: '/documents?library=true&tagSet=%5B%22Inbox%22%2C%22inbox%22%5D',
      },
      {
        kind: 'near-duplicate-correspondent',
        count: 2,
        label: 'northwind limited',
        url: '/documents?library=true&correspondentSet=%5B%22Northwind+Limited%22%2C%22Northwind+Ltd.%22%5D',
      },
      {
        kind: 'near-duplicate-document-type',
        count: 2,
        label: 'utility bill',
        url: '/documents?library=true&documentTypeSet=%5B%22Utility+Bill%22%2C%22Utility-Bill%22%5D',
      },
      {
        kind: 'custom-field-opportunity',
        count: 2,
        label: 'documents with ocr and no custom fields',
        url: '/ai-processing/custom-fields',
      },
    ]);
    expect(JSON.stringify(first)).not.toMatch(
      /Private title|Another private|OCR secret|SECRET-100|private-value/,
    );
    for (const insight of first.insights) {
      const url = new URL(insight.url, 'http://localhost');
      if (url.pathname === '/documents') {
        expect(url.searchParams.get('library')).toBe('true');
        const input = Object.fromEntries(url.searchParams);
        delete input.library;
        const query = documentLibraryQuerySchema.parse(input);
        expect(listDocumentLibrary(db, query).counts.total, insight.kind).toBe(insight.count);
      }
    }
  });

  it('returns only bounded, deterministic aggregates for 50,000 documents', () => {
    const sqlite = (db as AppDatabase & { $client: Database.Database }).$client;
    const insertDocument = sqlite.prepare(`
      INSERT INTO document (
        id, paperless_id, title, correspondent, document_type, tags_json,
        custom_fields_json, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContent = sqlite.prepare(`
      INSERT INTO document_content (id, document_id, full_text, word_count)
      VALUES (?, ?, ?, ?)
    `);
    sqlite.transaction(() => {
      for (let index = 1; index <= 50_000; index += 1) {
        const id = `scale-${index}`;
        insertDocument.run(
          id,
          index,
          `private-${index}`,
          index % 2 === 0 ? `Organisation ${index}` : null,
          index % 3 === 0 ? `Type ${index}` : null,
          JSON.stringify(['common', `tag-${index}`]),
          '[]',
          '2026-01-01T00:00:00Z',
        );
        if (index % 5 !== 0) insertContent.run(`content-${index}`, id, 'private OCR', 2);
      }
    })();

    const result = getDataQualityInsights(db);

    expect(result.totalDocuments).toBe(50_000);
    expect(result.insights.length).toBeLessThanOrEqual(25);
    expect(result.insights.filter((insight) => insight.kind === 'overused-tag')).toEqual([
      {
        kind: 'overused-tag',
        count: 50_000,
        label: 'common',
        url: '/documents?library=true&tagSet=%5B%22common%22%5D',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private-');
  }, 20_000);
});
