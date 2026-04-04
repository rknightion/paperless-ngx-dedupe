import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { getAiResultGroups } from '../grouping.js';

function seedData(db: AppDatabase) {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice A',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Invoice B',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-3',
        paperlessId: 3,
        title: 'Receipt C',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-4',
        paperlessId: 4,
        title: 'Contract D',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
    ])
    .run();

  db.insert(aiProcessingResult)
    .values([
      {
        id: 'res-1',
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-4o-mini',
        suggestedCorrespondent: 'Amazon',
        suggestedDocumentType: 'Invoice',
        confidenceJson: '{"correspondent":0.9,"documentType":0.95,"tags":0.85}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'res-2',
        documentId: 'doc-2',
        paperlessId: 2,
        provider: 'openai',
        model: 'gpt-4o-mini',
        suggestedCorrespondent: 'Amazon',
        suggestedDocumentType: 'Invoice',
        confidenceJson: '{"correspondent":0.85,"documentType":0.9,"tags":0.7}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-02T00:00:00Z',
      },
      {
        id: 'res-3',
        documentId: 'doc-3',
        paperlessId: 3,
        provider: 'openai',
        model: 'gpt-4o-mini',
        suggestedCorrespondent: 'Tesco',
        suggestedDocumentType: 'Receipt',
        confidenceJson: '{"correspondent":0.4,"documentType":0.3,"tags":0.2}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-03T00:00:00Z',
      },
      {
        id: 'res-4',
        documentId: 'doc-4',
        paperlessId: 4,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        appliedStatus: 'failed',
        failureType: 'rate_limit',
        errorMessage: 'Rate limited',
        createdAt: '2024-01-04T00:00:00Z',
      },
    ])
    .run();
}

describe('getAiResultGroups', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedData(db);
  });

  it('groups by suggestedCorrespondent', () => {
    const result = getAiResultGroups(db, 'suggestedCorrespondent');
    expect(result.groups.length).toBeGreaterThanOrEqual(2);

    const amazonGroup = result.groups.find((g) => g.key === 'Amazon');
    expect(amazonGroup).toBeDefined();
    expect(amazonGroup!.count).toBe(2);
    expect(amazonGroup!.resultIds).toContain('res-1');
    expect(amazonGroup!.resultIds).toContain('res-2');

    const tescoGroup = result.groups.find((g) => g.key === 'Tesco');
    expect(tescoGroup).toBeDefined();
    expect(tescoGroup!.count).toBe(1);
  });

  it('groups by suggestedDocumentType', () => {
    const result = getAiResultGroups(db, 'suggestedDocumentType');
    const invoiceGroup = result.groups.find((g) => g.key === 'Invoice');
    expect(invoiceGroup).toBeDefined();
    expect(invoiceGroup!.count).toBe(2);

    const receiptGroup = result.groups.find((g) => g.key === 'Receipt');
    expect(receiptGroup).toBeDefined();
    expect(receiptGroup!.count).toBe(1);
  });

  it('groups by failureType', () => {
    const result = getAiResultGroups(db, 'failureType');
    const rateLimitGroup = result.groups.find((g) => g.key === 'rate_limit');
    expect(rateLimitGroup).toBeDefined();
    expect(rateLimitGroup!.count).toBe(1);
    expect(rateLimitGroup!.resultIds).toContain('res-4');
  });

  it('groups by confidenceBand', () => {
    const result = getAiResultGroups(db, 'confidenceBand');
    expect(result.groups.length).toBeGreaterThanOrEqual(1);

    // res-1 and res-2 have high confidence (avg > 0.8)
    const highGroup = result.groups.find((g) => g.key.includes('High'));
    expect(highGroup).toBeDefined();
    expect(highGroup!.count).toBe(2);

    // res-3 has low confidence (avg ~0.3) and res-4 has null confidence (also low)
    const lowGroup = result.groups.find((g) => g.key.includes('Low'));
    expect(lowGroup).toBeDefined();
    expect(lowGroup!.count).toBe(2);
  });

  it('applies filters to grouping', () => {
    const result = getAiResultGroups(db, 'suggestedCorrespondent', {
      status: 'pending_review',
    });

    // Only pending_review results (excludes res-4 which is failed)
    const totalItems = result.groups.reduce((sum, g) => sum + g.count, 0);
    expect(totalItems).toBe(3);
  });

  it('returns empty groups when no results match', () => {
    const result = getAiResultGroups(db, 'suggestedCorrespondent', {
      provider: 'nonexistent',
    });
    expect(result.groups).toHaveLength(0);
  });
});
