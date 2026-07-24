import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskFunction } from '../worker-entry.js';
import type { AiBatchResult } from '../../ai/types.js';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { UnknownAiModelPricingError } from '../../ai/budget.js';

const mocks = vi.hoisted(() => ({
  runWorkerTask: vi.fn(),
  createAiProvider: vi.fn().mockResolvedValue({ provider: 'openai' }),
  processBatch: vi.fn(),
  aiConfig: {
    maxRetries: 10,
    model: 'gpt-5.4-mini',
    flexProcessing: true,
  },
}));

vi.mock('../worker-entry.js', () => ({ runWorkerTask: mocks.runWorkerTask }));
vi.mock('../../ai/providers/factory.js', () => ({ createAiProvider: mocks.createAiProvider }));
vi.mock('../../ai/batch.js', () => ({ processBatch: mocks.processBatch }));
vi.mock('../../ai/config.js', () => ({ getAiConfig: () => mocks.aiConfig }));
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

  it('disables SDK retries and applies the configured cap for scheduled work', async () => {
    const batchResult: AiBatchResult = {
      totalDocuments: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      durationMs: 1,
      rateLimitRetries: 0,
      rateLimitPauses: 0,
    };
    mocks.processBatch.mockResolvedValue(batchResult);
    await import('./ai-processing-worker.js');
    const task = mocks.runWorkerTask.mock.calls[0]?.[0] as TaskFunction;
    const handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    const now = '2026-07-24T00:00:00.000Z';
    handle.sqlite
      .prepare(
        `UPDATE automation_schedule
         SET enabled = 1, cadence_json = ?, next_due_at = ?, updated_at = ?
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'daily', hour: 3, minute: 0 }), now, now);
    handle.sqlite
      .prepare(`UPDATE app_config SET value = '5' WHERE key = 'automation.aiMonthlyBudgetUsd'`)
      .run();
    handle.sqlite
      .prepare(
        `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(
        'ai.modelPricingCache',
        JSON.stringify({
          'gpt-5.4-mini': {
            inputPerToken: 0.000001,
            outputPerToken: 0.000002,
            cacheReadPerToken: null,
            cacheCreationPerToken: null,
          },
        }),
        now,
      );
    handle.sqlite
      .prepare(
        `INSERT INTO job (
          id, type, status, progress, trigger_kind, schedule_id, due_at,
          attempt, created_at
        ) VALUES ('scheduled-ai-job', 'ai_processing', 'running', 0, 'schedule',
                  'automation-ai_processing', ?, 0, ?)`,
      )
      .run(now, now);
    handle.sqlite
      .prepare(
        `INSERT INTO dispatch_intent (
          id, task, operation, job_id, trigger_kind, schedule_id, due_at,
          status, attempt_count, dispatch_key, created_at, updated_at
        ) VALUES ('scheduled-ai-intent', 'ai_processing', 'ai_processing',
                  'scheduled-ai-job', 'schedule', 'automation-ai_processing', ?,
                  'dispatched', 0, 'scheduled-ai-key', ?, ?)`,
      )
      .run(now, now, now);

    await task(
      {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'scheduled-ai-job',
        taskData: { documentIds: ['doc-1', 'doc-2'] },
        executionToken: 'worker-token',
      },
      vi.fn(),
    );

    expect(mocks.createAiProvider).toHaveBeenCalledWith('test-key', 'gpt-5.4-mini', 0, true);
    expect(mocks.processBatch).toHaveBeenCalledWith(
      handle.db,
      expect.objectContaining({ maxDocuments: 25 }),
    );
  });

  it('blocks scheduled work before provider creation when exact model pricing is unavailable', async () => {
    await import('./ai-processing-worker.js');
    const task = mocks.runWorkerTask.mock.calls[0]?.[0] as TaskFunction;
    const handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    const now = '2026-07-24T00:00:00.000Z';
    handle.sqlite
      .prepare(
        `UPDATE automation_schedule
         SET enabled = 1, cadence_json = ?, next_due_at = ?, updated_at = ?
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'daily', hour: 3, minute: 0 }), now, now);
    handle.sqlite
      .prepare(`UPDATE app_config SET value = '5' WHERE key = 'automation.aiMonthlyBudgetUsd'`)
      .run();
    handle.sqlite
      .prepare(
        `INSERT INTO job (
          id, type, status, progress, trigger_kind, schedule_id, due_at,
          attempt, created_at
        ) VALUES ('unknown-price-job', 'ai_processing', 'running', 0, 'schedule',
                  'automation-ai_processing', ?, 0, ?)`,
      )
      .run(now, now);
    handle.sqlite
      .prepare(
        `INSERT INTO dispatch_intent (
          id, task, operation, job_id, trigger_kind, schedule_id, due_at,
          status, attempt_count, dispatch_key, created_at, updated_at
        ) VALUES ('unknown-price-intent', 'ai_processing', 'ai_processing',
                  'unknown-price-job', 'schedule', 'automation-ai_processing', ?,
                  'dispatched', 0, 'unknown-price-key', ?, ?)`,
      )
      .run(now, now, now);

    await expect(
      task(
        {
          db: handle.db,
          sqlite: handle.sqlite,
          jobId: 'unknown-price-job',
          taskData: {},
          executionToken: 'worker-token',
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      name: UnknownAiModelPricingError.name,
      message: 'Scheduled AI cannot run because model pricing is unavailable',
    });

    expect(mocks.createAiProvider).not.toHaveBeenCalled();
    expect(mocks.processBatch).not.toHaveBeenCalled();
  });
});
