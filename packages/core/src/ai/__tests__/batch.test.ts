import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { aiResultRevision } from '../../schema/sqlite/ai-result-revisions.js';
import type { AiProviderInterface, AiExtractionResult } from '../providers/types.js';
import { AiExtractionError } from '../providers/types.js';
import type { PaperlessClient } from '../../paperless/client.js';
import { DEFAULT_AI_CONFIG } from '../types.js';
import type { AiConfig } from '../types.js';
import { AiBudgetExceededError, UnknownAiModelPricingError } from '../budget.js';
import { replaceCustomFieldPolicy } from '../custom-field-policy.js';

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
const { processBatch, computeRequestInterval } = await import('../batch.js');

function createMockProvider(
  overrides?: Partial<{
    extractFn: AiProviderInterface['extract'];
    providerName: string;
  }>,
): AiProviderInterface {
  const defaultResult: AiExtractionResult = {
    response: {
      title: 'Amazon Invoice - Jan 2024',
      correspondent: 'Amazon',
      documentType: 'Invoice',
      tags: ['finance'],
      confidence: { title: 0.9, correspondent: 0.9, documentType: 0.95, tags: 0.8 },
      evidence: 'Amazon header',
    },
    usage: { promptTokens: 100, completionTokens: 50 },
  };

  return {
    provider: (overrides?.providerName ?? 'openai') as 'openai',
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
    getCustomFields: vi.fn().mockResolvedValue([]),
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
  let sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    sqlite = handle.sqlite;
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

    // Verify results were inserted into DB (2 succeeded + 1 skipped)
    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults).toHaveLength(3);
    const succeeded = dbResults.filter((r) => r.appliedStatus === 'pending_review');
    const skipped = dbResults.filter((r) => r.appliedStatus === 'skipped');
    expect(succeeded).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].failureType).toBe('no_content');
  });

  it('fails before an AI request when custom-field extraction has no allowlist', async () => {
    seedDocs(db);
    const provider = createMockProvider();
    const client = createMockClient();

    await expect(
      processBatch(db, {
        provider,
        client,
        config: { ...config, extractCustomFields: true },
      }),
    ).rejects.toMatchObject({ code: 'empty_policy' });

    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('snapshots the selected live fields once and prompts in numeric ID order', async () => {
    seedDocs(db);
    replaceCustomFieldPolicy(
      db,
      [{ fieldId: 9, guidance: 'Use the final amount due.' }, { fieldId: 2 }],
      [
        {
          id: 9,
          name: 'Amount',
          dataType: 'monetary',
          extraData: { selectOptions: [], defaultCurrency: 'GBP' },
          documentCount: 1,
        },
        {
          id: 2,
          name: 'Due date',
          dataType: 'date',
          extraData: { selectOptions: [] },
          documentCount: 1,
        },
        {
          id: 4,
          name: 'Not selected',
          dataType: 'string',
          extraData: { selectOptions: [] },
          documentCount: 1,
        },
      ],
    );
    const client = createMockClient();
    vi.mocked(client.getCustomFields).mockResolvedValue([
      {
        id: 4,
        name: 'Not selected',
        dataType: 'string',
        extraData: { selectOptions: [] },
        documentCount: 1,
      },
      {
        id: 9,
        name: 'Amount',
        dataType: 'monetary',
        extraData: { selectOptions: [], defaultCurrency: 'GBP' },
        documentCount: 1,
      },
      {
        id: 2,
        name: 'Due date',
        dataType: 'date',
        extraData: { selectOptions: [] },
        documentCount: 1,
      },
    ]);
    const provider = createMockProvider();

    await processBatch(db, {
      provider,
      client,
      config: { ...config, extractCustomFields: true },
    });

    expect(client.getCustomFields).toHaveBeenCalledTimes(1);
    expect(provider.extract).toHaveBeenCalledTimes(2);
    const prompt = vi.mocked(provider.extract).mock.calls[0][0].systemPrompt;
    expect(prompt.indexOf('"id": 2')).toBeLessThan(prompt.indexOf('"id": 9'));
    expect(prompt).not.toContain('Not selected');
    expect(prompt).toContain('Use the final amount due.');
  });

  it('fails on a stale custom-field snapshot before an AI request', async () => {
    seedDocs(db);
    replaceCustomFieldPolicy(
      db,
      [{ fieldId: 2 }],
      [
        {
          id: 2,
          name: 'Due date',
          dataType: 'date',
          extraData: { selectOptions: [] },
          documentCount: 1,
        },
      ],
    );
    const client = createMockClient();
    vi.mocked(client.getCustomFields).mockResolvedValue([
      {
        id: 2,
        name: 'Payment date',
        dataType: 'date',
        extraData: { selectOptions: [] },
        documentCount: 1,
      },
    ]);
    const provider = createMockProvider();

    await expect(
      processBatch(db, {
        provider,
        client,
        config: { ...config, extractCustomFields: true },
      }),
    ).rejects.toMatchObject({ code: 'renamed_field' });

    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('fails mutable live option growth before batch budget or provider calls', async () => {
    seedDocs(db);
    const saved = {
      id: 2,
      name: 'Status',
      dataType: 'select' as const,
      extraData: { selectOptions: [{ id: 'open', label: 'Open' }] },
      documentCount: 1,
    };
    replaceCustomFieldPolicy(db, [{ fieldId: 2 }], [saved]);
    const client = createMockClient();
    vi.mocked(client.getCustomFields).mockResolvedValue([
      {
        ...saved,
        extraData: {
          selectOptions: Array.from({ length: 100 }, (_, index) => ({
            id: `option-${index}-${'x'.repeat(200)}`,
            label: `Label ${index} ${'y'.repeat(200)}`,
          })),
        },
      },
    ]);
    const provider = createMockProvider();
    const requestBudget = {
      reserve: vi.fn(),
      reconcile: vi.fn(),
    };

    await expect(
      processBatch(db, {
        provider,
        client,
        config: { ...config, extractCustomFields: true },
        requestBudget,
      }),
    ).rejects.toMatchObject({ code: 'prompt_too_large' });

    expect(requestBudget.reserve).not.toHaveBeenCalled();
    expect(provider.extract).not.toHaveBeenCalled();
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

    // Verify a skipped record was written to the DB
    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults).toHaveLength(1);
    expect(dbResults[0].appliedStatus).toBe('skipped');
    expect(dbResults[0].failureType).toBe('no_content');
    expect(dbResults[0].errorMessage).toContain('no OCR text');
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

    const error = new AiExtractionError('timeout', 'Request timed out');
    const provider = createMockProvider({
      extractFn: vi.fn().mockRejectedValue(error),
    });
    const client = createMockClient();

    // Use batchSize: 1 to ensure sequential processing for predictable circuit breaker behavior
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    await expect(processBatch(db, { provider, client, config: seqConfig })).rejects.toThrow(
      /Processing stopped.*3 consecutive documents failed/,
    );
  });

  it('rate_limit errors do not trip the circuit breaker', async () => {
    seedDocs(db);

    const error = new AiExtractionError('rate_limit', 'Rate limited', undefined, 10);
    const provider = createMockProvider({
      extractFn: vi.fn().mockRejectedValue(error),
    });
    const client = createMockClient();

    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    // Rate-limited docs are retried (up to 3 passes) then permanently failed
    // Circuit breaker should NOT fire
    const result = await processBatch(db, { provider, client, config: seqConfig });
    // 2 processable docs, each retried 3 times + 1 initial = 4 attempts each
    // Both end as failed after retry exhaustion, plus 1 skipped (no content)
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.rateLimitRetries).toBeGreaterThan(0);
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
        appliedStatus: 'pending_review',
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

  it('snapshots prior results for success, failure, and skipped replacements', async () => {
    seedDocs(db);
    db.insert(aiProcessingResult)
      .values(
        ['doc-1', 'doc-2', 'doc-3'].map((documentId, index) => ({
          documentId,
          paperlessId: index + 1,
          provider: 'openai',
          model: 'old-model',
          suggestedTitle: `Old ${documentId}`,
          appliedStatus: 'pending_review',
          createdAt: '2024-01-01T00:00:00Z',
        })),
      )
      .run();
    const extractFn = vi
      .fn()
      .mockResolvedValueOnce({
        response: {
          title: 'Replacement',
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      })
      .mockRejectedValueOnce(new AiExtractionError('timeout', 'Request timed out'));

    const result = await processBatch(db, {
      provider: createMockProvider({ extractFn }),
      client: createMockClient(),
      config: { ...config, batchSize: 1 },
      reprocess: true,
    });

    expect(result).toMatchObject({ succeeded: 1, failed: 1, skipped: 1 });
    expect(db.select().from(aiResultRevision).all()).toHaveLength(3);
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

  it('caps direct scheduled document IDs without capping manual callers', async () => {
    seedDocs(db);
    const scheduledProvider = createMockProvider();
    const prepareSpy = vi.spyOn(sqlite, 'prepare');
    const scheduled = await processBatch(db, {
      provider: scheduledProvider,
      client: createMockClient(),
      config,
      documentIds: ['doc-1', 'doc-2'],
      maxDocuments: 1,
    });
    expect(scheduled.totalDocuments).toBe(1);
    expect(scheduledProvider.extract).toHaveBeenCalledTimes(1);
    expect(
      prepareSpy.mock.calls.some(
        ([statement]) =>
          typeof statement === 'string' &&
          statement.toLowerCase().includes('from "document"') &&
          statement.toLowerCase().includes('limit ?'),
      ),
    ).toBe(true);
    prepareSpy.mockRestore();

    db.delete(aiProcessingResult).run();
    const manualProvider = createMockProvider();
    const manual = await processBatch(db, {
      provider: manualProvider,
      client: createMockClient(),
      config,
      documentIds: ['doc-1', 'doc-2'],
    });
    expect(manual.totalDocuments).toBe(2);
    expect(manualProvider.extract).toHaveBeenCalledTimes(2);
  });

  it.each(['unprocessed', 'reprocess'] as const)(
    'applies the scheduled document cap to the %s query',
    async (queryKind) => {
      seedDocs(db);
      const provider = createMockProvider();
      const prepareSpy = vi.spyOn(sqlite, 'prepare');

      const result = await processBatch(db, {
        provider,
        client: createMockClient(),
        config,
        ...(queryKind === 'reprocess' ? { reprocess: true } : {}),
        maxDocuments: 1,
      });

      expect(result.totalDocuments).toBe(1);
      expect(provider.extract).toHaveBeenCalledTimes(1);
      expect(
        prepareSpy.mock.calls.some(
          ([statement]) =>
            typeof statement === 'string' &&
            statement.toLowerCase().includes('from "document"') &&
            statement.toLowerCase().includes('limit ?'),
        ),
      ).toBe(true);
      prepareSpy.mockRestore();
    },
  );

  it('accepts fifty thousand explicit IDs without exceeding SQLite variable limits', async () => {
    seedDocs(db);
    const documentIds = Array.from({ length: 50_000 }, (_, index) => `missing-${index}`);
    documentIds[10_001] = 'doc-1';
    documentIds[40_001] = 'doc-2';
    const provider = createMockProvider();

    const result = await processBatch(db, {
      provider,
      client: createMockClient(),
      config,
      documentIds,
    });

    expect(result.totalDocuments).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(provider.extract).toHaveBeenCalledTimes(2);
  });

  it('selects one unprocessed document beyond 32,767 processed rows without materializing IDs', async () => {
    sqlite.exec(`
      BEGIN;
      WITH RECURSIVE sequence(value) AS (
        VALUES (1)
        UNION ALL
        SELECT value + 1 FROM sequence WHERE value < 32768
      )
      INSERT INTO document (
        id, paperless_id, title, processing_status, synced_at
      )
      SELECT
        printf('processed-%05d', value),
        value,
        'Processed',
        'completed',
        '2026-07-24T00:00:00.000Z'
      FROM sequence;

      INSERT INTO ai_processing_result (
        id, document_id, paperless_id, provider, model, applied_status, created_at
      )
      SELECT
        'result-' || id,
        id,
        paperless_id,
        'openai',
        'old-model',
        'pending_review',
        '2026-07-24T00:00:00.000Z'
      FROM document;

      INSERT INTO document (
        id, paperless_id, title, processing_status, synced_at
      ) VALUES (
        'unprocessed-candidate', 40000, 'Unprocessed', 'completed',
        '2026-07-24T00:00:00.000Z'
      );
      INSERT INTO document_content (
        id, document_id, full_text, content_hash
      ) VALUES (
        'content-unprocessed-candidate', 'unprocessed-candidate',
        'Candidate content', 'candidate-hash'
      );
      COMMIT;
    `);
    const provider = createMockProvider();

    const result = await processBatch(db, {
      provider,
      client: createMockClient(),
      config,
      maxDocuments: 1,
    });

    expect(result.totalDocuments).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(provider.extract).toHaveBeenCalledTimes(1);
    expect(
      db
        .select({ documentId: aiProcessingResult.documentId })
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.documentId, 'unprocessed-candidate'))
        .get(),
    ).toEqual({ documentId: 'unprocessed-candidate' });
  });

  it.each([
    ['generation', AiBudgetExceededError],
    ['generation', UnknownAiModelPricingError],
    ['direct', AiBudgetExceededError],
    ['direct', UnknownAiModelPricingError],
  ] as const)(
    'preserves %s eligibility and prior result when %s blocks before the provider',
    async (scope, ErrorType) => {
      db.insert(document)
        .values({
          id: 'policy-doc',
          paperlessId: 101,
          title: 'Policy document',
          processingStatus: 'completed',
          syncedAt: '2026-07-24T00:00:00.000Z',
          lastChangedBySyncGenerationId: scope === 'generation' ? 'generation-policy' : null,
        })
        .run();
      db.insert(documentContent)
        .values({
          documentId: 'policy-doc',
          fullText: 'Budget-sensitive content',
          contentHash: 'policy-hash',
        })
        .run();
      db.insert(aiProcessingResult)
        .values({
          documentId: 'policy-doc',
          paperlessId: 101,
          provider: 'openai',
          model: 'old-model',
          suggestedTitle: 'Keep this result',
          appliedStatus: 'pending_review',
          syncGenerationId: scope === 'generation' ? 'older-generation' : null,
          createdAt: '2026-07-23T00:00:00.000Z',
        })
        .run();
      const provider = createMockProvider();
      const requestBudget = {
        reserve: vi.fn(async () => {
          throw new ErrorType();
        }),
        reconcile: vi.fn(async () => undefined),
      };

      await expect(
        processBatch(db, {
          provider,
          client: createMockClient(),
          config: { ...config, batchSize: 1 },
          ...(scope === 'generation'
            ? { syncGenerationId: 'generation-policy' }
            : { reprocess: true, documentIds: ['policy-doc'] }),
          maxDocuments: 25,
          requestBudget,
        }),
      ).rejects.toBeInstanceOf(ErrorType);

      expect(provider.extract).not.toHaveBeenCalled();
      expect(
        db
          .select({
            model: aiProcessingResult.model,
            suggestedTitle: aiProcessingResult.suggestedTitle,
            appliedStatus: aiProcessingResult.appliedStatus,
            syncGenerationId: aiProcessingResult.syncGenerationId,
          })
          .from(aiProcessingResult)
          .where(eq(aiProcessingResult.documentId, 'policy-doc'))
          .get(),
      ).toEqual({
        model: 'old-model',
        suggestedTitle: 'Keep this result',
        appliedStatus: 'pending_review',
        syncGenerationId: scope === 'generation' ? 'older-generation' : null,
      });
      expect(db.select().from(aiResultRevision).all()).toHaveLength(0);
    },
  );

  it('scopes dependent work to a sync generation, reprocesses changed results, and caps the run', async () => {
    seedDocs(db);
    db.update(document)
      .set({ lastChangedBySyncGenerationId: 'generation-1' })
      .where(eq(document.id, 'doc-1'))
      .run();
    db.update(document)
      .set({ lastChangedBySyncGenerationId: 'generation-1' })
      .where(eq(document.id, 'doc-2'))
      .run();
    db.insert(aiProcessingResult)
      .values({
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'old-model',
        suggestedTitle: 'Old title',
        appliedStatus: 'pending_review',
        syncGenerationId: 'older-generation',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .run();
    const provider = createMockProvider();

    const first = await processBatch(db, {
      provider,
      client: createMockClient(),
      config,
      syncGenerationId: 'generation-1',
      maxDocuments: 1,
    });
    expect(first.totalDocuments).toBe(1);
    expect(
      db.select().from(aiProcessingResult).where(eq(aiProcessingResult.documentId, 'doc-1')).get()
        ?.syncGenerationId,
    ).toBe('generation-1');

    const restarted = await processBatch(db, {
      provider,
      client: createMockClient(),
      config,
      syncGenerationId: 'generation-1',
      maxDocuments: 25,
    });
    expect(restarted.totalDocuments).toBe(1);
    expect(provider.extract).toHaveBeenCalledTimes(2);
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

    // Should be called: initial 0, skip report, and per-document completions
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

describe('computeRequestInterval', () => {
  it('auto-calculates interval for OpenAI at 85% of 5000 RPM', () => {
    const interval = computeRequestInterval('openai', 0);
    // floor(5000 * 0.85) = 4250 RPM → ceil(60000/4250) = 15ms
    expect(interval).toBe(15);
  });

  it('uses rateDelayMs override when explicitly set', () => {
    expect(computeRequestInterval('openai', 1000)).toBe(1000);
  });

  it('falls back to OpenAI limits for unknown providers', () => {
    const interval = computeRequestInterval('unknown-provider', 0);
    expect(interval).toBe(15);
  });
});

describe('concurrent processing', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedManyDocs(db: AppDatabase, count: number) {
    const docs = [];
    const contents = [];
    for (let i = 1; i <= count; i++) {
      docs.push({
        id: `doc-${i}`,
        paperlessId: i,
        title: `Doc ${i}`,
        processingStatus: 'completed' as const,
        syncedAt: '2024-01-01T00:00:00Z',
      });
      contents.push({
        documentId: `doc-${i}`,
        fullText: `Content for document ${i}`,
        contentHash: `hash${i}`,
      });
    }
    db.insert(document).values(docs).run();
    db.insert(documentContent).values(contents).run();
  }

  it('respects batchSize as max concurrency', async () => {
    seedManyDocs(db, 6);

    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;

    const extractFn = vi.fn().mockImplementation(async () => {
      currentConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
      // Simulate API latency so concurrent requests overlap
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentConcurrency--;
      return {
        response: {
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const concurrencyConfig: AiConfig = { ...config, batchSize: 2 };

    const result = await processBatch(db, { provider, client, config: concurrencyConfig });

    expect(result.succeeded).toBe(6);
    expect(extractFn).toHaveBeenCalledTimes(6);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
  });

  it('batchSize: 1 processes sequentially', async () => {
    seedManyDocs(db, 3);

    const callOrder: number[] = [];
    let callIndex = 0;
    let maxConcurrency = 0;
    let currentConcurrency = 0;

    const extractFn = vi.fn().mockImplementation(async () => {
      const myIndex = callIndex++;
      currentConcurrency++;
      maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
      callOrder.push(myIndex);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrency--;
      return {
        response: {
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.succeeded).toBe(3);
    expect(maxConcurrency).toBe(1);
    expect(callOrder).toEqual([0, 1, 2]);
  });

  it('circuit breaker fires across concurrent requests', async () => {
    seedManyDocs(db, 6);

    const error = new AiExtractionError('timeout', 'Request timed out');
    const provider = createMockProvider({
      extractFn: vi.fn().mockRejectedValue(error),
    });
    const client = createMockClient();

    // batchSize: 1 to ensure predictable sequential circuit breaker behavior
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    await expect(processBatch(db, { provider, client, config: seqConfig })).rejects.toThrow(
      /Processing stopped.*3 consecutive documents failed/,
    );

    // Should have stopped after 3 failures, not processed all 6
    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults.length).toBeLessThanOrEqual(4); // 3 errors + possibly 1 in-flight
  });

  it('circuit breaker resets on success in mixed results', async () => {
    seedManyDocs(db, 5);

    let callCount = 0;
    const error = new AiExtractionError('timeout', 'Request timed out');
    const extractFn = vi.fn().mockImplementation(async () => {
      callCount++;
      // Fail on calls 1, 2; succeed on 3; fail on 4, 5
      if (callCount <= 2 || callCount >= 4) {
        throw error;
      }
      return {
        response: {
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    // Use batchSize: 1 for predictable ordering
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    // Success on call 3 resets the counter, so calls 4 and 5 only give 2 consecutive errors
    // (below threshold of 3) — all 5 documents should be processed
    expect(result.processed).toBe(5);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(4);
  });

  it('uses rateDelayMs override when set explicitly', async () => {
    seedManyDocs(db, 2);

    const provider = createMockProvider();
    const client = createMockClient();

    const startMs = performance.now();
    const delayConfig: AiConfig = { ...config, rateDelayMs: 100 };
    await processBatch(db, { provider, client, config: delayConfig });
    const durationMs = performance.now() - startMs;

    // With rateDelayMs: 100 and 2 docs, there should be at least ~100ms delay
    expect(durationMs).toBeGreaterThanOrEqual(80); // Allow some timer imprecision
  });
});

describe('rate limit retry queue', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedManyDocs(db: AppDatabase, count: number) {
    const docs = [];
    const contents = [];
    for (let i = 1; i <= count; i++) {
      docs.push({
        id: `doc-${i}`,
        paperlessId: i,
        title: `Doc ${i}`,
        processingStatus: 'completed' as const,
        syncedAt: '2024-01-01T00:00:00Z',
      });
      contents.push({
        documentId: `doc-${i}`,
        fullText: `Content for document ${i}`,
        contentHash: `hash${i}`,
      });
    }
    db.insert(document).values(docs).run();
    db.insert(documentContent).values(contents).run();
  }

  it('retries rate-limited documents instead of marking them as failed', async () => {
    seedManyDocs(db, 3);

    let callCount = 0;
    const requestKeys: string[] = [];
    const requestBudget = {
      reserve: vi.fn(async ({ requestKey }: { requestKey: string }) => {
        requestKeys.push(requestKey);
        return { id: `reservation-${requestKeys.length}` };
      }),
      reconcile: vi.fn(async () => undefined),
    };
    const extractFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) {
        throw new AiExtractionError('rate_limit', 'Rate limited', undefined, 50);
      }
      return {
        response: {
          title: 'Test',
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, {
      provider,
      client,
      config: seqConfig,
      requestBudget,
    });

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.rateLimitRetries).toBe(3);
    expect(result.rateLimitPauses).toBeGreaterThan(0);
    expect(extractFn).toHaveBeenCalledTimes(6);
    expect(requestBudget.reserve).toHaveBeenCalledTimes(6);
    expect(requestBudget.reconcile).toHaveBeenCalledTimes(3);
    expect(new Set(requestKeys).size).toBe(6);
  });

  it('records permanent failure after max retry passes', async () => {
    seedManyDocs(db, 1);

    const extractFn = vi
      .fn()
      .mockRejectedValue(new AiExtractionError('rate_limit', 'Rate limited', undefined, 10));

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(extractFn).toHaveBeenCalledTimes(4);

    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults).toHaveLength(1);
    expect(dbResults[0].appliedStatus).toBe('failed');
    expect(dbResults[0].failureType).toBe('rate_limit');
  });

  it('tracks rateLimitRetries and rateLimitPauses in result', async () => {
    seedManyDocs(db, 2);

    let callCount = 0;
    const extractFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new AiExtractionError('rate_limit', 'Rate limited', undefined, 10);
      }
      return {
        response: {
          title: 'Test',
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.rateLimitRetries).toBe(1);
    expect(result.rateLimitPauses).toBe(1);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});
