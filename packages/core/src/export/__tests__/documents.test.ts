import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabaseWithHandle } from '../../db/client.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { documentLibraryQuerySchema } from '../../queries/types.js';
import { escapeDocumentCsvCell, streamDocumentLibraryCsv } from '../documents.js';

describe('document library CSV export', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('uses the active library filters and deterministic cursor order without exporting OCR text', () => {
    db.insert(document)
      .values([
        {
          id: 'older-finance',
          paperlessId: 10,
          title: 'Older invoice',
          tagsJson: '["finance"]',
          addedDate: '2026-01-01T00:00:00Z',
          syncedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'newer-lower-id',
          paperlessId: 20,
          title: 'Newer invoice B',
          tagsJson: '["finance"]',
          addedDate: '2026-02-01T00:00:00Z',
          syncedAt: '2026-02-01T00:00:00Z',
        },
        {
          id: 'newer-higher-id',
          paperlessId: 30,
          title: 'Newer invoice A',
          tagsJson: '["finance"]',
          addedDate: '2026-02-01T00:00:00Z',
          syncedAt: '2026-02-01T00:00:00Z',
        },
        {
          id: 'excluded',
          paperlessId: 40,
          title: 'Legal contract',
          tagsJson: '["legal"]',
          addedDate: '2026-03-01T00:00:00Z',
          syncedAt: '2026-03-01T00:00:00Z',
        },
      ])
      .run();
    db.insert(documentContent)
      .values({
        id: 'private-ocr',
        documentId: 'newer-higher-id',
        fullText: 'PRIVATE OCR MUST NOT APPEAR',
        wordCount: 5,
      })
      .run();

    const csv = Array.from(
      streamDocumentLibraryCsv(db, documentLibraryQuerySchema.parse({ tag: 'finance', limit: 25 })),
    ).join('');

    expect(csv).not.toContain('PRIVATE OCR MUST NOT APPEAR');
    expect(csv).not.toContain('Legal contract');
    expect(csv).toContain(
      '\uFEFFpaperless_id,title,correspondent,document_type,tags,created_date,added_date,processing_status,has_ocr,duplicate_group_count,ai_status,ai_freshness\r\n',
    );
    expect([...csv.matchAll(/^(30|20|10),/gm)].map((match) => Number(match[1]))).toEqual([
      30, 20, 10,
    ]);
  });

  it('fetches subsequent cursor pages lazily instead of materializing the full result set', () => {
    db.insert(document)
      .values(
        Array.from({ length: 101 }, (_, index) => {
          const paperlessId = index + 1;
          return {
            id: `document-${paperlessId}`,
            paperlessId,
            title: `Document ${paperlessId}`,
            addedDate: '2026-01-01T00:00:00Z',
            syncedAt: '2026-01-01T00:00:00Z',
          };
        }),
      )
      .run();

    const chunks = streamDocumentLibraryCsv(db, documentLibraryQuerySchema.parse({ limit: 25 }));
    expect(chunks.next().value).toContain('paperless_id,title');

    const firstPageIds: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const chunk = chunks.next();
      expect(chunk.done).toBe(false);
      firstPageIds.push(Number(chunk.value?.split(',', 1)[0]));
    }
    expect(firstPageIds).toEqual(Array.from({ length: 100 }, (_, index) => 101 - index));

    db.delete(document).run();

    expect(chunks.next()).toEqual({ done: true, value: undefined });
  });

  it('uses count-free 100-row cursor pages with stable ties', () => {
    db.insert(document)
      .values(
        Array.from({ length: 205 }, (_, index) => {
          const paperlessId = index + 1;
          return {
            id: `document-${paperlessId}`,
            paperlessId,
            title: `Document ${paperlessId}`,
            addedDate: '2026-01-01T00:00:00Z',
            syncedAt: '2026-01-01T00:00:00Z',
          };
        }),
      )
      .run();

    const preparedSql: string[] = [];
    const prepare = db.$client.prepare.bind(db.$client);
    const prepareSpy = vi.spyOn(db.$client, 'prepare').mockImplementation((sql: string) => {
      preparedSql.push(sql);
      return prepare(sql);
    });

    const csv = Array.from(
      streamDocumentLibraryCsv(db, documentLibraryQuerySchema.parse({ limit: 25 })),
    ).join('');
    prepareSpy.mockRestore();

    const ids = [...csv.matchAll(/^(\d+),/gm)].map((match) => Number(match[1]));
    expect(ids).toEqual(Array.from({ length: 205 }, (_, index) => 205 - index));

    const exportSelects = preparedSql.filter((sql) => sql.includes('FROM document d'));
    expect(exportSelects).toHaveLength(3);
    expect(exportSelects.every((sql) => sql.includes('LIMIT ?'))).toBe(true);
    expect(exportSelects.every((sql) => !/\bcount\s*\(\s*\*\s*\)\s+AS\s+total\b/i.test(sql))).toBe(
      true,
    );
  });

  it('fully drains a 50k export without aggregate SQL on every page', () => {
    const batchSize = 500;
    for (let start = 1; start <= 50_000; start += batchSize) {
      db.insert(document)
        .values(
          Array.from({ length: batchSize }, (_, index) => {
            const paperlessId = start + index;
            return {
              id: `scale-${paperlessId}`,
              paperlessId,
              title: `Document ${paperlessId}`,
              addedDate: `2024-${String((paperlessId % 12) + 1).padStart(2, '0')}-${String(
                (paperlessId % 28) + 1,
              ).padStart(2, '0')}`,
              syncedAt: '2024-01-01T00:00:00Z',
            };
          }),
        )
        .run();
    }

    const preparedSql: string[] = [];
    const prepare = db.$client.prepare.bind(db.$client);
    const prepareSpy = vi.spyOn(db.$client, 'prepare').mockImplementation((sql: string) => {
      preparedSql.push(sql);
      return prepare(sql);
    });
    const startedAt = performance.now();
    let rows = 0;
    for (const chunk of streamDocumentLibraryCsv(
      db,
      documentLibraryQuerySchema.parse({ limit: 25 }),
    )) {
      if (/^\d+,/.test(chunk)) rows += 1;
    }
    const elapsedMs = performance.now() - startedAt;
    prepareSpy.mockRestore();

    const exportSelects = preparedSql.filter((sql) => sql.includes('FROM document d'));
    expect(rows).toBe(50_000);
    expect(exportSelects).toHaveLength(500);
    expect(exportSelects.some((sql) => /\bcount\s*\(\s*\*\s*\)\s+AS\s+total\b/i.test(sql))).toBe(
      false,
    );
    expect(elapsedMs).toBeLessThan(30_000);
  }, 45_000);

  it.each([
    ['=HYPERLINK("https://invalid")', '"\'=HYPERLINK(""https://invalid"")"'],
    [' +SUM(1,2)', '"\' +SUM(1,2)"'],
    ['\t-2+3', "'\t-2+3"],
    ['\u0000\u200B@cmd', "'\u0000\u200B@cmd"],
  ])(
    'neutralizes formula-like string values after leading whitespace or controls',
    (value, safe) => {
      expect(escapeDocumentCsvCell(value)).toBe(safe);
    },
  );

  it('preserves typed numeric values and follows RFC-style CSV quoting', () => {
    expect(escapeDocumentCsvCell(-42)).toBe('-42');
    expect(escapeDocumentCsvCell('a "quoted", value')).toBe('"a ""quoted"", value"');
    expect(escapeDocumentCsvCell(null)).toBe('');
  });
});
