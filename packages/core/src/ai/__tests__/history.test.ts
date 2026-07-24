import { beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseWithHandle, type AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { clearJobHistory } from '../../jobs/manager.js';
import { clearAiResultHistory, replaceAiResultWithRevision } from '../history.js';

describe('AI result revision lifecycle', () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'];

  beforeEach(async () => {
    ({ db, sqlite } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(sqlite);
    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Document',
        syncedAt: '2026-07-24T00:00:00.000Z',
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'result-1',
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'old-model',
        suggestedTitle: 'Old title',
        confidenceJson: '{"title":0.5}',
        evidence: 'old evidence',
        promptTokens: 11,
        completionTokens: 7,
        appliedStatus: 'pending_review',
        createdAt: '2026-07-24T00:00:00.000Z',
      })
      .run();
  });

  it('snapshots the replaced result before updating it', () => {
    replaceAiResultWithRevision(db, 'doc-1', {
      provider: 'openai',
      model: 'new-model',
      suggestedTitle: 'New title',
      confidenceJson: '{"title":0.9}',
      evidence: 'new evidence',
      promptTokens: 21,
      completionTokens: 9,
      appliedStatus: 'pending_review',
      createdAt: '2026-07-24T01:00:00.000Z',
      syncGenerationId: 'generation-1',
    });

    expect(
      sqlite
        .prepare(
          `SELECT revision, model, suggested_title AS suggestedTitle, evidence,
                  prompt_tokens AS promptTokens, applied_status AS appliedStatus
           FROM ai_result_revision`,
        )
        .get(),
    ).toEqual({
      revision: 1,
      model: 'old-model',
      suggestedTitle: 'Old title',
      evidence: 'old evidence',
      promptTokens: 11,
      appliedStatus: 'pending_review',
    });
    expect(
      sqlite
        .prepare(
          'SELECT model, suggested_title AS suggestedTitle, sync_generation_id AS syncGenerationId FROM ai_processing_result',
        )
        .get(),
    ).toEqual({
      model: 'new-model',
      suggestedTitle: 'New title',
      syncGenerationId: 'generation-1',
    });
  });

  it('preserves revisions during ordinary job cleanup and deletes them only via explicit cleanup', () => {
    replaceAiResultWithRevision(db, 'doc-1', {
      provider: 'openai',
      model: 'new-model',
      suggestedTitle: 'New title',
      appliedStatus: 'pending_review',
      createdAt: '2026-07-24T01:00:00.000Z',
    });
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, progress, created_at, completed_at)
         VALUES ('job-1', 'ai_processing', 'completed', 1, ?, ?)`,
      )
      .run('2026-07-24T00:00:00.000Z', '2026-07-24T01:00:00.000Z');

    expect(clearJobHistory(db)).toBe(1);
    expect(sqlite.prepare('SELECT count(*) AS count FROM ai_result_revision').get()).toEqual({
      count: 1,
    });

    expect(clearAiResultHistory(db)).toBe(1);
    expect(sqlite.prepare('SELECT count(*) AS count FROM ai_result_revision').get()).toEqual({
      count: 0,
    });
  });
});
