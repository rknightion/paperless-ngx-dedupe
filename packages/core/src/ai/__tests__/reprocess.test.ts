import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabaseWithHandle, type AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { PaperlessClient } from '../../paperless/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { aiResultRevision } from '../../schema/sqlite/ai-result-revisions.js';
import { reprocessSingleResult } from '../reprocess.js';
import { AiExtractionError, type AiProviderInterface } from '../providers/types.js';
import { DEFAULT_AI_CONFIG } from '../types.js';
import { replaceCustomFieldPolicy } from '../custom-field-policy.js';

describe('single AI result reprocessing revisions', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    ({ db } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(
      (db as unknown as { $client: Parameters<typeof migrateDatabase>[0] }).$client,
    );
    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Document',
        processingStatus: 'completed',
        syncedAt: '2026-07-24T00:00:00.000Z',
      })
      .run();
    db.insert(documentContent)
      .values({
        documentId: 'doc-1',
        fullText: 'Document content',
        contentHash: 'hash-1',
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'result-1',
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'old-model',
        suggestedTitle: 'Old suggestion',
        evidence: 'Old evidence',
        appliedStatus: 'pending_review',
        createdAt: '2026-07-23T00:00:00.000Z',
      })
      .run();
  });

  const client = {} as PaperlessClient;

  it.each(['applied', 'partial'])(
    'rejects %s before network requests and preserves its snapshot',
    async (appliedStatus) => {
      db.update(aiProcessingResult)
        .set({ appliedStatus, preApplyTitle: 'Original', appliedTitle: 'AI title' })
        .run();
      const before = db.select().from(aiProcessingResult).get();
      const calls = {
        getCorrespondents: vi.fn().mockResolvedValue([]),
        getDocumentTypes: vi.fn().mockResolvedValue([]),
        getTags: vi.fn().mockResolvedValue([]),
        getCustomFields: vi.fn().mockResolvedValue([]),
      };
      const provider: AiProviderInterface = { provider: 'openai', extract: vi.fn() };
      await expect(
        reprocessSingleResult(db, 'result-1', {
          provider,
          client: calls as unknown as PaperlessClient,
          config: {
            ...DEFAULT_AI_CONFIG,
            includeCorrespondents: true,
            includeDocumentTypes: true,
            includeTags: true,
            extractCustomFields: true,
          },
        }),
      ).rejects.toMatchObject({ name: 'AiResultNotReprocessableError' });
      for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
      expect(provider.extract).not.toHaveBeenCalled();
      expect(db.select().from(aiProcessingResult).get()).toEqual(before);
      expect(db.select().from(aiResultRevision).all()).toEqual([]);
    },
  );

  it.each(['pending_review', 'reverted'])(
    'snapshots a %s result transactionally before a successful replacement',
    async (appliedStatus) => {
      db.update(aiProcessingResult).set({ appliedStatus }).run();
      const provider: AiProviderInterface = {
        provider: 'openai',
        extract: vi.fn().mockResolvedValue({
          response: {
            title: 'New suggestion',
            correspondent: null,
            documentType: null,
            tags: [],
            confidence: { title: 0.9, correspondent: 0, documentType: 0, tags: 0 },
            evidence: 'New evidence',
          },
          usage: { promptTokens: 50, completionTokens: 10 },
        }),
      };

      await reprocessSingleResult(db, 'result-1', {
        provider,
        client,
        config: DEFAULT_AI_CONFIG,
      });

      expect(db.select().from(aiResultRevision).all()).toEqual([
        expect.objectContaining({
          resultId: 'result-1',
          revision: 1,
          model: 'old-model',
          suggestedTitle: 'Old suggestion',
          evidence: 'Old evidence',
          appliedStatus,
        }),
      ]);
      expect(db.select().from(aiProcessingResult).get()).toMatchObject({
        id: 'result-1',
        model: DEFAULT_AI_CONFIG.model,
        suggestedTitle: 'New suggestion',
        appliedStatus: 'pending_review',
      });
    },
  );

  it('fails stale custom-field policy validation before reprocessing with OpenAI', async () => {
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
    const policyClient = {
      getCustomFields: vi.fn().mockResolvedValue([
        {
          id: 2,
          name: 'Due date',
          dataType: 'string',
          extraData: { selectOptions: [] },
          documentCount: 1,
        },
      ]),
    } as unknown as PaperlessClient;
    const provider: AiProviderInterface = {
      provider: 'openai',
      extract: vi.fn(),
    };

    await expect(
      reprocessSingleResult(db, 'result-1', {
        provider,
        client: policyClient,
        config: { ...DEFAULT_AI_CONFIG, extractCustomFields: true },
      }),
    ).rejects.toMatchObject({ code: 'type_changed_field' });

    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('snapshots the prior result transactionally before recording reprocess failure', async () => {
    const provider: AiProviderInterface = {
      provider: 'openai',
      extract: vi.fn().mockRejectedValue(new AiExtractionError('timeout', 'Request timed out')),
    };

    await expect(
      reprocessSingleResult(db, 'result-1', {
        provider,
        client,
        config: DEFAULT_AI_CONFIG,
      }),
    ).rejects.toThrow('Request timed out');

    expect(db.select().from(aiResultRevision).all()).toEqual([
      expect.objectContaining({
        resultId: 'result-1',
        revision: 1,
        model: 'old-model',
        suggestedTitle: 'Old suggestion',
        appliedStatus: 'pending_review',
      }),
    ]);
    expect(db.select().from(aiProcessingResult).get()).toMatchObject({
      id: 'result-1',
      model: DEFAULT_AI_CONFIG.model,
      appliedStatus: 'failed',
      errorMessage: '[timeout] Request timed out',
      failureType: 'timeout',
    });
  });
});
