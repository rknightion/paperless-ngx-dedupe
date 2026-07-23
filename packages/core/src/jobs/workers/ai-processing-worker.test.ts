import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskFunction } from '../worker-entry.js';
import type { AiBatchResult } from '../../ai/types.js';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';

const mocks = vi.hoisted(() => ({
  runWorkerTask: vi.fn(),
  createAiProvider: vi.fn().mockResolvedValue({ provider: 'openai' }),
  processBatch: vi.fn(),
}));

vi.mock('../worker-entry.js', () => ({ runWorkerTask: mocks.runWorkerTask }));
vi.mock('../../ai/providers/factory.js', () => ({ createAiProvider: mocks.createAiProvider }));
vi.mock('../../ai/batch.js', () => ({ processBatch: mocks.processBatch }));
vi.mock('../../ai/config.js', () => ({ getAiConfig: () => ({}) }));
vi.mock('../../index.js', () => ({
  PaperlessClient: class PaperlessClient {},
  parseConfig: () => ({ AI_OPENAI_API_KEY: 'test-key' }),
  toPaperlessConfig: () => ({}),
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('AI processing worker', () => {
  it('leaves processed results pending review', async () => {
    const batchResult: AiBatchResult = {
      totalDocuments: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      durationMs: 1,
      rateLimitRetries: 0,
      rateLimitPauses: 0,
    };
    await import('./ai-processing-worker.js');
    const task = mocks.runWorkerTask.mock.calls[0]?.[0] as TaskFunction;
    const handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    handle.db
      .insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    mocks.processBatch.mockImplementation(async (db) => {
      db.insert(aiProcessingResult)
        .values({
          documentId: 'doc-1',
          paperlessId: 1,
          provider: 'openai',
          model: 'gpt-5.4-mini',
          appliedStatus: 'pending_review',
          createdAt: '2024-01-01T00:00:00Z',
        })
        .run();
      return batchResult;
    });

    await expect(
      task({ db: handle.db, sqlite: handle.sqlite, jobId: 'job-1', taskData: {} }, vi.fn()),
    ).resolves.toEqual(batchResult);
    expect(handle.db.select().from(aiProcessingResult).get()?.appliedStatus).toBe('pending_review');
  });
});
