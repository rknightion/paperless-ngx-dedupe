import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { discoverCustomFieldCandidates } from '../custom-field-discovery.js';

describe('discoverCustomFieldCandidates', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);

    for (let index = 0; index < 20; index++) {
      const documentId = `doc-${index}`;
      db.insert(document)
        .values({
          id: documentId,
          paperlessId: index + 1,
          title: `Invoice ${index + 1}`,
          syncedAt: '2026-07-23T00:00:00Z',
        })
        .run();
      db.insert(documentContent)
        .values({
          documentId,
          fullText: [
            `Account Number: ACC-${String(index + 1).padStart(4, '0')}`,
            `Payment Status: ${index % 2 === 0 ? 'Paid' : 'Open'}`,
            `Due Date: 2026-08-${String((index % 20) + 1).padStart(2, '0')}`,
            'Document Type: Invoice',
          ].join('\n'),
        })
        .run();
    }
  });

  it('uses the whole OCR corpus to infer reusable typed fields', () => {
    const result = discoverCustomFieldCandidates(db);

    expect(result.documentsScanned).toBe(20);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Account Number', dataType: 'string', documentCount: 20 }),
        expect.objectContaining({
          name: 'Payment Status',
          dataType: 'select',
          selectOptions: ['Open', 'Paid'],
          documentCount: 20,
        }),
        expect.objectContaining({ name: 'Due Date', dataType: 'date', documentCount: 20 }),
      ]),
    );
  });

  it('excludes first-class Paperless metadata and existing custom fields', () => {
    const result = discoverCustomFieldCandidates(db, {
      existingFieldNames: ['Account Number'],
    });

    expect(result.candidates.some((candidate) => candidate.name === 'Document Type')).toBe(false);
    expect(result.candidates.some((candidate) => candidate.name === 'Account Number')).toBe(false);
  });
});
