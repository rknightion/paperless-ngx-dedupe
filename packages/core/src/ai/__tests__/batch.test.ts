import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import type { AiProviderInterface, AiExtractionResult } from '../providers/types.js';
import { AiExtractionError } from '../providers/types.js';
import type { PaperlessClient } from '../../paperless/client.js';
import { DEFAULT_AI_CONFIG } from '../types.js';
import type { AiConfig } from '../types.js';

vi.mock('../../telemetry/spans.js', () => ({
  withSpan: vi
    .fn()
    .mockImplementation((_name, _attrs, fn) =>
      fn({ setAttribute: vi.fn(), setAttributes: vi.fn() }),
    ),
}));

vi.mock('../../telemetry/metrics.js', () => ({
  aiDocumentsTotal: vi.fn(() => ({ add: vi.fn() })),
  aiTokensTotal: vi.fn(() => ({ add: vi.fn() })),
  aiRunsTotal: vi.fn(() => ({ add: vi.fn() })),
  aiBatchDuration: vi.fn(() => ({ record: vi.fn() })),
  aiDocumentDuration: vi.fn(() => ({ record: vi.fn() })),
}));

// Import after mocks are registered
const { processBatch } = await import('../batch.js');

function createMockProvider(
  overrides?: Partial<{
    extractFn: AiProviderInterface['extract'];
  }>,
): AiProviderInterface {
  const defaultResult: AiExtractionResult = {
    response: {
      correspondent: 'Amazon',
      documentType: 'Invoice',
      tags: ['finance'],
      confidence: { correspondent: 0.9, documentType: 0.95, tags: 0.8 },
      evidence: 'Amazon header',
    },
    usage: { promptTokens: 100, completionTokens: 50 },
  };

  return {
    provider: 'openai',
    extract: overrides?.extractFn ?? vi.fn().mockResolvedValue(defaultResult),
  };
}

function createMockClient(includeData = true): PaperlessClient {
  return {
    getCorrespondents: vi
      .fn()
      .mockResolvedValue(
        includeData ? [{ id: 1, name: 'Amazon', slug: 'amazon', matchingAlgorithm: 0 }] : [],
      ),
    getDocumentTypes: vi
      .fn()
      .mockResolvedValue(
        includeData ? [{ id: 1, name: 'Invoice', slug: 'invoice', matchingAlgorithm: 0 }] : [],
      ),
    getTags: vi
      .fn()
      .mockResolvedValue(
        includeData ? [{ id: 1, name: 'finance', slug: 'finance', color: '#000' }] : [],
      ),
  } as unknown as PaperlessClient;
}

const config: AiConfig = { ...DEFAULT_AI_CONFIG, rateDelayMs: 0 };

function seedDocs(db: AppDatabase) {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Doc 1',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Doc 2',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-3',
        paperlessId: 3,
        title: 'Doc 3 (no content)',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
    ])
    .run();

  db.insert(documentContent)
    .values([
      { documentId: 'doc-1', fullText: 'Invoice from Amazon', contentHash: 'hash1' },
      { documentId: 'doc-2', fullText: 'Receipt from Tesco', contentHash: 'hash2' },
      // doc-3 has no content row
    ])
    .run();
}

describe('processBatch', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('processes all documents and inserts results into DB', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, { provider, client, config });

    expect(result.totalDocuments).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.skipped).toBe(1); // doc-3 has no content
    expect(result.failed).toBe(0);
    expect(result.processed).toBe(3);

    // Verify results were inserted into DB
    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults).toHaveLength(2);
    expect(dbResults.every((r) => r.appliedStatus === 'pending')).toBe(true);
  });

  it('skips documents without content (result.skipped incremented)', async () => {
    // Only doc-3 with no content
    db.insert(document)
      .values({
        id: 'doc-no-content',
        paperlessId: 99,
        title: 'No Content Doc',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, { provider, client, config });

    expect(result.skipped).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('returns zero-document result for empty DB', async () => {
    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, { provider, client, config });

    expect(result.totalDocuments).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('triggers circuit breaker after 3 consecutive same errors', async () => {
    seedDocs(db);
    // Add more docs so we have enough to trigger the breaker
    db.insert(document)
      .values([
        {
          id: 'doc-4',
          paperlessId: 4,
          title: 'Doc 4',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-5',
          paperlessId: 5,
          title: 'Doc 5',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();
    db.insert(documentContent)
      .values([
        { documentId: 'doc-4', fullText: 'Content 4', contentHash: 'hash4' },
        { documentId: 'doc-5', fullText: 'Content 5', contentHash: 'hash5' },
      ])
      .run();

    const error = new AiExtractionError('rate_limit', 'Rate limited');
    const provider = createMockProvider({
      extractFn: vi.fn().mockRejectedValue(error),
    });
    const client = createMockClient();

    await expect(processBatch(db, { provider, client, config })).rejects.toThrow(
      /Processing stopped.*3 consecutive documents failed/,
    );
  });

  it('only processes unprocessed docs (already-processed excluded)', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    // Pre-insert a result for doc-1
    db.insert(aiProcessingResult)
      .values({
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Amazon',
        appliedStatus: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const result = await processBatch(db, { provider, client, config });

    // doc-1 should be excluded, doc-2 processed, doc-3 skipped (no content)
    expect(result.totalDocuments).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('processes all docs with reprocess=true', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    // Pre-insert a result for doc-1
    db.insert(aiProcessingResult)
      .values({
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Amazon',
        appliedStatus: 'applied',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const result = await processBatch(db, { provider, client, config, reprocess: true });

    // With reprocess, doc-1 should be included again
    expect(result.totalDocuments).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('processes only specified documentIds', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, {
      provider,
      client,
      config,
      documentIds: ['doc-1'],
    });

    expect(result.totalDocuments).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(provider.extract).toHaveBeenCalledTimes(1);
  });

  it('fetches reference data only when include flags enabled', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const noIncludeConfig: AiConfig = {
      ...config,
      includeCorrespondents: false,
      includeDocumentTypes: false,
      includeTags: false,
    };

    await processBatch(db, { provider, client, config: noIncludeConfig });

    expect(client.getCorrespondents).not.toHaveBeenCalled();
    expect(client.getDocumentTypes).not.toHaveBeenCalled();
    expect(client.getTags).not.toHaveBeenCalled();
  });

  it('fetches reference data when include flags are enabled', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const includeConfig: AiConfig = {
      ...config,
      includeCorrespondents: true,
      includeDocumentTypes: true,
      includeTags: true,
    };

    await processBatch(db, { provider, client, config: includeConfig });

    expect(client.getCorrespondents).toHaveBeenCalled();
    expect(client.getDocumentTypes).toHaveBeenCalled();
    expect(client.getTags).toHaveBeenCalled();
  });

  it('calls onProgress callback with correct progress values', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();
    const onProgress = vi.fn();

    await processBatch(db, { provider, client, config, onProgress });

    // 3 documents total: initial 0 call + 3 per-document calls
    expect(onProgress).toHaveBeenCalled();
    // First call should be at 0 progress
    expect(onProgress.mock.calls[0][0]).toBe(0);
    // Last call should be at 1.0 (3/3)
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(1);
  });

  it('records token usage in result', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, { provider, client, config });

    // 2 successful docs * 100 prompt tokens each
    expect(result.totalPromptTokens).toBe(200);
    // 2 successful docs * 50 completion tokens each
    expect(result.totalCompletionTokens).toBe(100);
  });

  it('records durationMs in result', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    const result = await processBatch(db, { provider, client, config });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
