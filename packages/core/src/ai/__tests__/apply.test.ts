import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import type { PaperlessClient } from '../../paperless/client.js';
import { getAiResult } from '../queries.js';

vi.mock('../../telemetry/spans.js', () => ({
  withSpan: vi
    .fn()
    .mockImplementation((_name, _attrs, fn) =>
      fn({ setAttribute: vi.fn(), setAttributes: vi.fn() }),
    ),
}));

vi.mock('../../telemetry/metrics.js', () => ({
  aiApplyTotal: vi.fn(() => ({ add: vi.fn() })),
}));

// Import after mocks are registered
const { applyAiResult, rejectAiResult, batchRejectAiResults } = await import('../apply.js');

function createMockClient() {
  return {
    getCorrespondents: vi.fn().mockResolvedValue([
      { id: 1, name: 'Amazon', slug: 'amazon', matchingAlgorithm: 0 },
      { id: 2, name: 'Barclays', slug: 'barclays', matchingAlgorithm: 0 },
    ]),
    getDocumentTypes: vi.fn().mockResolvedValue([
      { id: 1, name: 'Invoice', slug: 'invoice', matchingAlgorithm: 0 },
      { id: 2, name: 'Receipt', slug: 'receipt', matchingAlgorithm: 0 },
    ]),
    getTags: vi.fn().mockResolvedValue([
      { id: 1, name: 'finance', slug: 'finance', color: '#000' },
      { id: 2, name: 'shopping', slug: 'shopping', color: '#000' },
    ]),
    createCorrespondent: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), matchingAlgorithm: 0 }),
      ),
    createDocumentType: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), matchingAlgorithm: 0 }),
      ),
    createTag: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), color: '#000' }),
      ),
    updateDocument: vi.fn().mockResolvedValue(undefined),
  } as unknown as PaperlessClient;
}

function seedDocumentAndResult(db: AppDatabase): string {
  db.insert(document)
    .values({
      id: 'doc-1',
      paperlessId: 1,
      title: 'Invoice A',
      processingStatus: 'completed',
      syncedAt: '2024-01-01T00:00:00Z',
    })
    .run();

  const result = db
    .insert(aiProcessingResult)
    .values({
      documentId: 'doc-1',
      paperlessId: 1,
      provider: 'openai',
      model: 'gpt-5.4-mini',
      suggestedCorrespondent: 'Amazon',
      suggestedDocumentType: 'Invoice',
      suggestedTagsJson: '["finance","new-tag"]',
      confidenceJson: '{"correspondent":0.9,"documentType":0.95,"tags":0.8}',
      appliedStatus: 'pending_review',
      promptTokens: 100,
      completionTokens: 50,
      createdAt: '2024-01-01T00:00:00Z',
    })
    .returning()
    .get();

  return result.id;
}

describe('applyAiResult', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultId = seedDocumentAndResult(db);
  });

  it('resolves existing correspondent by name (case-insensitive) and applies', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ correspondent: 1 }), // Amazon has id 1
    );
    expect(client.createCorrespondent).not.toHaveBeenCalled();
  });

  it('creates new correspondent when not found in list', async () => {
    const client = createMockClient();
    // Change suggested correspondent to something not in the list
    db.update(aiProcessingResult).set({ suggestedCorrespondent: 'HMRC' }).run();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.createCorrespondent).toHaveBeenCalledWith('HMRC');
    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ correspondent: 99 }),
    );
  });

  it('resolves existing document type', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['documentType'],
    });

    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ documentType: 1 }), // Invoice has id 1
    );
    expect(client.createDocumentType).not.toHaveBeenCalled();
  });

  it('resolves existing tags and creates missing ones', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
    });

    // 'finance' exists (id 1), 'new-tag' does not
    expect(client.createTag).toHaveBeenCalledWith('new-tag');
    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        tags: expect.arrayContaining([1, 99]),
      }),
    );
  });

  it('applies only selected fields', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent');
    expect(updateArg).not.toHaveProperty('documentType');
    expect(updateArg).not.toHaveProperty('tags');
  });

  it('calls client.updateDocument with resolved numeric IDs', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.updateDocument).toHaveBeenCalledTimes(1);
    const [paperlessId, update] = vi.mocked(client.updateDocument).mock.calls[0];
    expect(paperlessId).toBe(1);
    expect(typeof update.correspondent).toBe('number');
    expect(typeof update.documentType).toBe('number');
    expect(Array.isArray(update.tags)).toBe(true);
  });

  it('throws for missing result ID', async () => {
    const client = createMockClient();
    await expect(
      applyAiResult(db, client, 'nonexistent-id', { fields: ['correspondent'] }),
    ).rejects.toThrow('AI result not found');
  });

  it('throws when result has no suggestions', async () => {
    const client = createMockClient();
    // Insert a result with null suggestions
    db.insert(document)
      .values({
        id: 'doc-empty',
        paperlessId: 99,
        title: 'Empty',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const emptyResult = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-empty',
        paperlessId: 99,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        suggestedTagsJson: null,
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    await expect(
      applyAiResult(db, client, emptyResult.id, { fields: ['correspondent'] }),
    ).rejects.toThrow('No suggestions to apply');
  });

  it('adds ai-processed tag when addProcessedTag is true', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      addProcessedTag: true,
      processedTagName: 'ai-processed',
    });

    // 'ai-processed' is not in the existing tags, so createTag should be called
    expect(client.createTag).toHaveBeenCalledWith('ai-processed');
    // The update should include the ai-processed tag id
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(99);
  });

  it('marks result as applied in DB after successful apply', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('applied');
  });

  it('marks result as partial when only some fields applied', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent'],
    });

    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('partial');
  });
});

describe('applyAiResult - safe defaults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedResultWithNullSuggestions(
    overrides: Partial<{
      suggestedCorrespondent: string | null;
      suggestedDocumentType: string | null;
      suggestedTagsJson: string | null;
    }> = {},
  ): string {
    db.insert(document)
      .values({
        id: 'doc-safe',
        paperlessId: 10,
        title: 'Safe Test Doc',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const result = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-safe',
        paperlessId: 10,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        suggestedTagsJson: '["finance"]',
        confidenceJson: '{"correspondent":0.5,"documentType":0.5,"tags":0.5}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
      })
      .returning()
      .get();

    return result.id;
  }

  it('does not clear existing correspondent when suggestion is null (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
    expect(updateArg).toHaveProperty('tags');
  });

  it('does not clear existing document type when suggestion is null (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedDocumentType: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['documentType', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('documentType');
  });

  it('does not clear existing tags when suggestions are empty (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'Amazon',
      suggestedTagsJson: '[]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent');
    expect(updateArg).not.toHaveProperty('tags');
  });

  it('clears correspondent when allowClearing is true and suggestion is null', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
      allowClearing: true,
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent', null);
  });

  it('does not create new entity when createMissingEntities is false', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'HMRC',
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
      createMissingEntities: false,
    });

    expect(client.createCorrespondent).not.toHaveBeenCalled();
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
  });

  it('never creates a correspondent named "unknown"', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'unknown',
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    expect(client.createCorrespondent).not.toHaveBeenCalled();
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
  });

  it('never creates a tag named "unknown"', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'Amazon',
      suggestedTagsJson: '["finance","unknown"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    expect(client.createTag).not.toHaveBeenCalledWith('unknown');
    expect(client.createTag).not.toHaveBeenCalledWith('Unknown');
  });
});

describe('rejectAiResult', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultId = seedDocumentAndResult(db);
  });

  it('marks result as rejected in DB', () => {
    rejectAiResult(db, resultId);
    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('rejected');
  });
});

describe('batchRejectAiResults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('marks all IDs as rejected', () => {
    // Seed multiple docs and results
    db.insert(document)
      .values([
        {
          id: 'doc-a',
          paperlessId: 10,
          title: 'Doc A',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-b',
          paperlessId: 11,
          title: 'Doc B',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    const r1 = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-a',
        paperlessId: 10,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Test',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    const r2 = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-b',
        paperlessId: 11,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Test',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    batchRejectAiResults(db, [r1.id, r2.id]);

    expect(getAiResult(db, r1.id)!.appliedStatus).toBe('rejected');
    expect(getAiResult(db, r2.id)!.appliedStatus).toBe('rejected');
  });
});
