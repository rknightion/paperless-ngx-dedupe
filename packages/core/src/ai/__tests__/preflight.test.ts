import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import type { PaperlessClient } from '../../paperless/client.js';
import type { AiApplyField } from '../apply.js';
import { setAiConfig } from '../config.js';
import { computeApplyPreflight } from '../preflight.js';
import type { ApplyScope } from '../scopes.js';

function createMockClient(): PaperlessClient {
  return {
    getCorrespondents: vi.fn().mockResolvedValue([]),
    getDocumentTypes: vi.fn().mockResolvedValue([]),
    getTags: vi.fn().mockResolvedValue([]),
  } as unknown as PaperlessClient;
}

describe('computeApplyPreflight', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);

    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    resultId = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'April Invoice',
        confidenceJson: '{"title":0.75,"correspondent":0,"documentType":0,"tags":0}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get().id;
  });

  it('uses configured thresholds to flag suggestions for human review without auto-apply eligibility', async () => {
    const scope: ApplyScope = { type: 'selected_result_ids', resultIds: [resultId] };
    const options = {
      fields: ['title'] as AiApplyField[],
      allowClearing: false,
      createMissingEntities: false,
    };

    const beforeThreshold = await computeApplyPreflight(db, createMockClient(), scope, options);
    expect(beforeThreshold.lowConfidenceCount).toBe(0);

    setAiConfig(db, { confidenceThresholdTitle: 0.8 });

    const afterThreshold = await computeApplyPreflight(db, createMockClient(), scope, options);
    expect(afterThreshold.lowConfidenceCount).toBe(1);
    expect(afterThreshold).not.toHaveProperty('gateResults');
  });
});
