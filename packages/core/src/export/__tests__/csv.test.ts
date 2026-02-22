import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { getDuplicateGroupsForExport, formatDuplicatesCsv } from '../csv.js';
import type { DuplicateExportRow } from '../types.js';

function insertTestData(db: AppDatabase) {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice A',
        correspondent: 'Alice',
        documentType: 'Invoice',
        tagsJson: '["finance","tax"]',
        createdDate: '2024-01-01',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Invoice B',
        correspondent: 'Alice',
        documentType: 'Invoice',
        tagsJson: '["finance"]',
        createdDate: '2024-01-02',
        syncedAt: '2024-01-01T00:00:00Z',
      },
    ])
    .run();

  db.insert(documentContent)
    .values([
      { id: 'cnt-1', documentId: 'doc-1', fullText: 'Invoice text A', wordCount: 3 },
      { id: 'cnt-2', documentId: 'doc-2', fullText: 'Invoice text B', wordCount: 5 },
    ])
    .run();

  db.insert(duplicateGroup)
    .values({
      id: 'grp-1',
      confidenceScore: 0.95,
      jaccardSimilarity: 0.9,
      fuzzyTextRatio: 0.88,
      algorithmVersion: 'v1',
      createdAt: '2024-01-10T00:00:00Z',
      updatedAt: '2024-01-10T00:00:00Z',
    })
    .run();

  db.insert(duplicateMember)
    .values([
      { id: 'mem-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true },
      { id: 'mem-2', groupId: 'grp-1', documentId: 'doc-2', isPrimary: false },
    ])
    .run();
}

describe('getDuplicateGroupsForExport', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns empty array for empty database', () => {
    const rows = getDuplicateGroupsForExport(db, { sortBy: 'confidence', sortOrder: 'desc' });
    expect(rows).toEqual([]);
  });

  it('returns all members with document data', () => {
    insertTestData(db);
    const rows = getDuplicateGroupsForExport(db, { sortBy: 'confidence', sortOrder: 'desc' });

    expect(rows).toHaveLength(2);

    const primary = rows.find((r) => r.isPrimary);
    expect(primary).toBeDefined();
    expect(primary!.paperlessId).toBe(1);
    expect(primary!.title).toBe('Invoice A');
    expect(primary!.tags).toEqual(['finance', 'tax']);
    expect(primary!.wordCount).toBe(3);
    expect(primary!.groupId).toBe('grp-1');
    expect(primary!.confidenceScore).toBe(0.95);
  });
});

describe('formatDuplicatesCsv', () => {
  it('returns BOM + header row only for empty input', () => {
    const csv = formatDuplicatesCsv([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      '\uFEFF' +
        'group_id,confidence_score,jaccard_similarity,fuzzy_text_ratio,' +
        'group_status,' +
        'is_primary,paperless_id,title,correspondent,document_type,tags,' +
        'created_date,word_count,group_created_at',
    );
    // Should have header + trailing CRLF (empty last element)
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('');
  });

  it('produces correct columns with sample data', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.95,
      jaccardSimilarity: 0.9,
      fuzzyTextRatio: 0.88,
      groupStatus: 'pending',
      isPrimary: true,
      paperlessId: 1,
      title: 'Invoice A',
      correspondent: 'Alice',
      documentType: 'Invoice',
      tags: ['finance', 'tax'],
      createdDate: '2024-01-01',
      wordCount: 3,
      groupCreatedAt: '2024-01-10T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 1 data row + trailing empty

    const dataLine = lines[1];
    expect(dataLine).toBe(
      'grp-1,0.95,0.9,0.88,pending,' +
        'true,1,Invoice A,Alice,Invoice,' +
        'finance|tax,2024-01-01,3,2024-01-10T00:00:00Z',
    );
  });

  it('quotes fields containing commas', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.5,
      jaccardSimilarity: null,
      fuzzyTextRatio: null,
      groupStatus: 'pending',
      isPrimary: false,
      paperlessId: 1,
      title: 'Invoice, with comma',
      correspondent: null,
      documentType: null,
      tags: [],
      createdDate: null,
      wordCount: null,
      groupCreatedAt: '2024-01-01T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    expect(csv).toContain('"Invoice, with comma"');
  });

  it('doubles internal quotes', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.5,
      jaccardSimilarity: null,
      fuzzyTextRatio: null,
      groupStatus: 'pending',
      isPrimary: false,
      paperlessId: 1,
      title: 'Invoice "Special"',
      correspondent: null,
      documentType: null,
      tags: [],
      createdDate: null,
      wordCount: null,
      groupCreatedAt: '2024-01-01T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    expect(csv).toContain('"Invoice ""Special"""');
  });

  it('renders tags as pipe-delimited', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.5,
      jaccardSimilarity: null,
      fuzzyTextRatio: null,
      groupStatus: 'pending',
      isPrimary: false,
      paperlessId: 1,
      title: 'Test',
      correspondent: null,
      documentType: null,
      tags: ['finance', 'tax', 'important'],
      createdDate: null,
      wordCount: null,
      groupCreatedAt: '2024-01-01T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    expect(csv).toContain('finance|tax|important');
  });

  it('renders null fields as empty strings', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.5,
      jaccardSimilarity: null,
      fuzzyTextRatio: null,
      groupStatus: 'pending',
      isPrimary: false,
      paperlessId: 1,
      title: 'Test',
      correspondent: null,
      documentType: null,
      tags: [],
      createdDate: null,
      wordCount: null,
      groupCreatedAt: '2024-01-01T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    const lines = csv.split('\r\n');
    const dataLine = lines[1];
    // jaccard, fuzzy all null => empty between commas
    expect(dataLine).toContain('0.5,,');
    // correspondent, documentType null => empty
    expect(dataLine).toContain('Test,,');
  });

  it('renders booleans as true/false and status as string', () => {
    const row: DuplicateExportRow = {
      groupId: 'grp-1',
      confidenceScore: 0.5,
      jaccardSimilarity: null,
      fuzzyTextRatio: null,
      groupStatus: 'deleted',
      isPrimary: true,
      paperlessId: 1,
      title: 'Test',
      correspondent: null,
      documentType: null,
      tags: [],
      createdDate: null,
      wordCount: null,
      groupCreatedAt: '2024-01-01T00:00:00Z',
    };

    const csv = formatDuplicatesCsv([row]);
    const lines = csv.split('\r\n');
    const dataLine = lines[1];
    expect(dataLine).toContain('deleted,true');
  });

  it('uses CRLF line endings', () => {
    const csv = formatDuplicatesCsv([]);
    // Should contain \r\n but not bare \n
    expect(csv).toContain('\r\n');
    // After BOM removal, every \n should be preceded by \r
    const noBom = csv.slice(1);
    const bareNewlines = noBom.replace(/\r\n/g, '').includes('\n');
    expect(bareNewlines).toBe(false);
  });
});
