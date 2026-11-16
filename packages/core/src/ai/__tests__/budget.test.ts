import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import {
  AiBudgetInvariantError,
  AiBudgetExceededError,
  OPENAI_RESPONSES_FRAMING_ALLOWANCE_TOKENS,
  UnsupportedAiModelEncodingError,
  UnknownAiModelPricingError,
  abandonAiReservations,
  countAiPromptTokens,
  reconcileAiBudgetReservation,
  resolveOpenAiTokenizerModel,
  reserveAiBudget,
} from '../budget.js';
import { buildOpenAiRequestParams } from '../providers/openai.js';
import { AiExtractionError } from '../providers/types.js';
import { type AiRequestBudget } from '../extract.js';
import { type TaskFunction } from '../../jobs/worker-entry.js';
import { type processBatch } from '../batch.js';
import { type PaperlessClient } from '../../paperless/client.js';
import { DEFAULT_AI_CONFIG } from '../types.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';

const workerMocks = vi.hoisted(() => ({
  runWorkerTask: vi.fn(),
  processBatch: vi.fn(),
  createAiProvider: vi.fn().mockResolvedValue({ provider: 'openai' }),
}));
vi.mock('../../jobs/worker-entry.js', () => ({ runWorkerTask: workerMocks.runWorkerTask }));
vi.mock('../providers/factory.js', () => ({ createAiProvider: workerMocks.createAiProvider }));
vi.mock('../batch.js', () => ({ processBatch: workerMocks.processBatch }));
vi.mock('../../index.js', () => ({
  PaperlessClient: class PaperlessClient {},
  parseConfig: () => ({ AI_OPENAI_API_KEY: 'synthetic-test-key' }),
  toPaperlessConfig: () => ({}),
}));

const PRICING = {
  inputPerToken: 0.000_001,
  outputPerToken: 0.000_002,
  cacheReadPerToken: null,
  cacheCreationPerToken: null,
};

describe('scheduled AI budget reservations', () => {
  let sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'];

  beforeEach(async () => {
    ({ sqlite } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(sqlite);
  });

  function reserveInvariantFixture(requestKey: string) {
    return reserveAiBudget(sqlite, {
      dispatchIntentId: 'intent-invariant',
      scheduleId: 'ai-schedule',
      requestKey,
      ownerToken: 'worker-invariant',
      model: 'known',
      pricing: PRICING,
      promptTokens: 100,
      maxOutputTokens: 50,
      monthlyBudgetUsd: 1,
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
  }

  function readReservation(id: string) {
    return sqlite
      .prepare(
        `SELECT status, prompt_tokens AS promptTokens,
                max_output_tokens AS maxOutputTokens,
                reserved_cost_usd AS reservedCostUsd,
                actual_cost_usd AS actualCostUsd,
                reconciled_at AS reconciledAt
         FROM ai_budget_reservation WHERE id = ?`,
      )
      .get(id);
  }

  function expectRaisedSpendToDenyFollowup(monthlyBudgetUsd: number, requestKey: string): void {
    expect(() =>
      reserveAiBudget(sqlite, {
        dispatchIntentId: `followup-${requestKey}`,
        scheduleId: 'ai-schedule',
        requestKey,
        ownerToken: 'worker-followup',
        model: 'known',
        pricing: PRICING,
        promptTokens: 0,
        maxOutputTokens: 1,
        monthlyBudgetUsd,
        now: new Date('2026-07-24T12:01:00.000Z'),
      }),
    ).toThrow(AiBudgetExceededError);
  }

  it('counts zero-usage reconciliation as zero monthly spend', () => {
    const reservation = reserveInvariantFixture('zero-usage');
    expect(
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 0,
        completionTokens: 0,
      }),
    ).toBe(true);
    expect(readReservation(reservation.id)).toMatchObject({
      status: 'reconciled',
      actualCostUsd: 0,
    });
    expect(
      sqlite
        .prepare(
          "SELECT SUM(CASE WHEN status = 'reserved' THEN reserved_cost_usd ELSE actual_cost_usd END) AS spent FROM ai_budget_reservation WHERE schedule_id = ? AND billing_month = ?",
        )
        .get('ai-schedule', reservation.billingMonth),
    ).toEqual({ spent: 0 });
  });

  it('reserves the exact prompt plus configured maximum output upper bound', () => {
    const reservation = reserveAiBudget(sqlite, {
      dispatchIntentId: 'intent-1',
      scheduleId: 'ai-schedule',
      requestKey: 'intent-1:doc-1:attempt-1',
      ownerToken: 'worker-1',
      model: 'known-model',
      pricing: PRICING,
      promptTokens: 123,
      maxOutputTokens: 456,
      monthlyBudgetUsd: 10,
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(reservation.reservedCostUsd).toBeCloseTo(123 * 0.000_001 + 456 * 0.000_002, 12);
    expect(
      sqlite
        .prepare(
          'SELECT prompt_tokens AS promptTokens, max_output_tokens AS maxOutputTokens FROM ai_budget_reservation',
        )
        .get(),
    ).toEqual({ promptTokens: 123, maxOutputTokens: 456 });
  });

  it('counts the selected model request representation, schema, roles, and framing allowance', async () => {
    const request = {
      systemPrompt: 'System instructions',
      userPrompt: 'Document body',
      reasoningEffort: 'low' as const,
      maxOutputTokens: 777,
    };
    const params = await buildOpenAiRequestParams(request, 'gpt-5.4-mini', true);
    const { encodingForModel } = await import('js-tiktoken');
    const encoding = encodingForModel('gpt-5');
    const wireTokens = encoding.encode(JSON.stringify(params)).length;

    expect(resolveOpenAiTokenizerModel('gpt-5.4-mini')).toBe('gpt-5');
    expect(params.input).toEqual([
      { role: 'developer', content: 'System instructions' },
      { role: 'user', content: 'Document body' },
    ]);
    expect(params.text.format).toMatchObject({
      type: 'json_schema',
      name: 'document_classification',
      strict: true,
      schema: expect.any(Object),
    });
    expect(await countAiPromptTokens(request, 'gpt-5.4-mini', true)).toBe(
      wireTokens + OPENAI_RESPONSES_FRAMING_ALLOWANCE_TOKENS,
    );
    expect(wireTokens).toBeGreaterThan(
      encoding.encode(request.systemPrompt + request.userPrompt).length,
    );
  });

  it('blocks models whose actual tokenizer family is unsupported', async () => {
    expect(() => resolveOpenAiTokenizerModel('custom-model')).toThrow(
      UnsupportedAiModelEncodingError,
    );
    await expect(
      countAiPromptTokens(
        {
          systemPrompt: 'system',
          userPrompt: 'user',
          maxOutputTokens: 100,
        },
        'custom-model',
        true,
      ),
    ).rejects.toThrow(UnsupportedAiModelEncodingError);
  });

  it('blocks unknown pricing and insufficient remaining monthly budget before reservation', () => {
    expect(() =>
      reserveAiBudget(sqlite, {
        dispatchIntentId: 'intent-1',
        scheduleId: 'ai-schedule',
        requestKey: 'unknown',
        ownerToken: 'worker-1',
        model: 'unknown',
        pricing: null,
        promptTokens: 1,
        maxOutputTokens: 1,
        monthlyBudgetUsd: 1,
        now: new Date('2026-07-24T12:00:00.000Z'),
      }),
    ).toThrow(UnknownAiModelPricingError);

    expect(() =>
      reserveAiBudget(sqlite, {
        dispatchIntentId: 'intent-1',
        scheduleId: 'ai-schedule',
        requestKey: 'too-expensive',
        ownerToken: 'worker-1',
        model: 'known',
        pricing: PRICING,
        promptTokens: 100,
        maxOutputTokens: 100,
        monthlyBudgetUsd: 0.000_01,
        now: new Date('2026-07-24T12:00:00.000Z'),
      }),
    ).toThrow(AiBudgetExceededError);
  });

  it('serializes concurrent reservations across SQLite connections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paperless-ai-budget-'));
    const path = join(dir, 'budget.sqlite');
    const first = createDatabaseWithHandle(path);
    await migrateDatabase(first.sqlite);
    first.sqlite.close();
    const input = {
      dispatchIntentId: 'intent',
      scheduleId: 'ai-schedule',
      ownerToken: 'worker',
      model: 'known',
      pricing: PRICING,
      promptTokens: 100,
      maxOutputTokens: 100,
      monthlyBudgetUsd: 0.000_35,
      now: new Date('2026-07-24T12:00:00.000Z'),
    };
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const state = new Int32Array(barrier);
    const runWorker = (requestKey: string) =>
      new Promise<{ status: 'fulfilled' | 'rejected'; startedAt: number; endedAt: number }>(
        (resolve, reject) => {
          const worker = new Worker(
            new URL('./fixtures/budget-reservation-worker.ts', import.meta.url),
            {
              execArgv: ['--import', 'tsx'],
              workerData: {
                path,
                barrier,
                input: { ...input, requestKey, now: input.now.toISOString() },
              },
            },
          );
          worker.once('message', resolve);
          worker.once('error', reject);
        },
      );

    const outcomes = await Promise.all([runWorker('request-a'), runWorker('request-b')]);
    expect(Atomics.load(state, 0)).toBe(2);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(outcomes.every((outcome) => outcome.startedAt <= outcome.endedAt)).toBe(true);
  });

  it('reconciles actual usage transactionally and separates calendar months', () => {
    const july = reserveAiBudget(sqlite, {
      dispatchIntentId: 'intent-1',
      scheduleId: 'ai-schedule',
      requestKey: 'july',
      ownerToken: 'worker-1',
      model: 'known',
      pricing: PRICING,
      promptTokens: 100,
      maxOutputTokens: 100,
      monthlyBudgetUsd: 0.000_31,
      now: new Date('2026-07-31T23:59:59.000Z'),
    });
    reconcileAiBudgetReservation(sqlite, july.id, {
      promptTokens: 10,
      completionTokens: 10,
      now: new Date('2026-07-31T23:59:59.500Z'),
    });

    const reconciled = sqlite
      .prepare(
        'SELECT status, actual_cost_usd AS actualCostUsd FROM ai_budget_reservation WHERE id = ?',
      )
      .get(july.id) as { status: string; actualCostUsd: number };
    expect(reconciled.status).toBe('reconciled');
    expect(reconciled.actualCostUsd).toBeCloseTo(0.000_03, 12);
    expect(
      sqlite
        .prepare(
          `SELECT prompt_tokens >= ? AS actualWithinReservedPrompt
           FROM ai_budget_reservation WHERE id = ?`,
        )
        .get(10, july.id),
    ).toEqual({ actualWithinReservedPrompt: 1 });

    expect(() =>
      reserveAiBudget(sqlite, {
        dispatchIntentId: 'intent-2',
        scheduleId: 'ai-schedule',
        requestKey: 'august',
        ownerToken: 'worker-2',
        model: 'known',
        pricing: PRICING,
        promptTokens: 100,
        maxOutputTokens: 100,
        monthlyBudgetUsd: 0.000_31,
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).not.toThrow();
  });

  it('fails safely when actual prompt usage breaches the reservation upper bound', () => {
    const reservation = reserveInvariantFixture('prompt-breach');

    expect(() =>
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 201,
        completionTokens: 0,
        now: new Date('2026-07-24T12:01:00.000Z'),
      }),
    ).toThrow(AiBudgetInvariantError);
    const retained = readReservation(reservation.id) as {
      status: string;
      promptTokens: number;
      maxOutputTokens: number;
      reservedCostUsd: number;
      actualCostUsd: number | null;
      reconciledAt: string | null;
    };
    expect(retained).toMatchObject({
      status: 'reserved',
      promptTokens: 100,
      maxOutputTokens: 50,
      actualCostUsd: null,
      reconciledAt: null,
    });
    expect(retained.reservedCostUsd).toBeCloseTo(201 * PRICING.inputPerToken, 12);
    expectRaisedSpendToDenyFollowup(0.000_202, 'after-prompt-overrun');
  });

  it('fails safely when actual output usage breaches the configured maximum', () => {
    const reservation = reserveInvariantFixture('output-breach');

    expect(() =>
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 100,
        completionTokens: 51,
      }),
    ).toThrow(AiBudgetInvariantError);
    const retained = readReservation(reservation.id) as { reservedCostUsd: number };
    expect(retained).toMatchObject({
      status: 'reserved',
      actualCostUsd: null,
      reconciledAt: null,
    });
    expect(retained.reservedCostUsd).toBeCloseTo(
      100 * PRICING.inputPerToken + 51 * PRICING.outputPerToken,
      12,
    );
    expectRaisedSpendToDenyFollowup(0.000_203, 'after-output-overrun');
  });

  it('raises a known invariant cost monotonically across repeated reports', () => {
    const reservation = reserveInvariantFixture('repeated-known-overrun');
    const outputOverrun = { promptTokens: 100, completionTokens: 51 };

    expect(() => reconcileAiBudgetReservation(sqlite, reservation.id, outputOverrun)).toThrow(
      AiBudgetInvariantError,
    );
    const raisedCost = (readReservation(reservation.id) as { reservedCostUsd: number })
      .reservedCostUsd;
    expect(raisedCost).toBeCloseTo(100 * PRICING.inputPerToken + 51 * PRICING.outputPerToken, 12);

    expect(() => reconcileAiBudgetReservation(sqlite, reservation.id, outputOverrun)).toThrow(
      AiBudgetInvariantError,
    );
    expect(() =>
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 101,
        completionTokens: 0,
      }),
    ).toThrow(AiBudgetInvariantError);
    expect(readReservation(reservation.id)).toMatchObject({
      status: 'reserved',
      reservedCostUsd: raisedCost,
      actualCostUsd: null,
      reconciledAt: null,
    });
  });

  it.each([
    ['negative prompt', -1, 1],
    ['NaN prompt', Number.NaN, 1],
    ['infinite prompt', Number.POSITIVE_INFINITY, 1],
    ['fractional prompt', 1.5, 1],
    ['negative completion', 1, -1],
    ['NaN completion', 1, Number.NaN],
    ['infinite completion', 1, Number.POSITIVE_INFINITY],
    ['fractional completion', 1, 1.5],
  ])(
    'rejects %s usage without reconciling the reservation',
    (_name, promptTokens, completionTokens) => {
      const reservation = reserveInvariantFixture(`invalid-${_name}`);

      expect(() =>
        reconcileAiBudgetReservation(sqlite, reservation.id, {
          promptTokens,
          completionTokens,
        }),
      ).toThrow(AiBudgetInvariantError);
      expect(readReservation(reservation.id)).toMatchObject({
        status: 'reserved',
        reservedCostUsd: reservation.reservedCostUsd,
        actualCostUsd: null,
        reconciledAt: null,
      });
    },
  );

  it('rejects a finite computed actual cost above the reserved bound', () => {
    const reservation = reserveInvariantFixture('computed-cost-overrun');
    sqlite
      .prepare(`UPDATE ai_budget_reservation SET reserved_cost_usd = ? WHERE id = ?`)
      .run(0.000_001, reservation.id);

    expect(() =>
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 1,
        completionTokens: 1,
      }),
    ).toThrow(AiBudgetInvariantError);
    const retained = readReservation(reservation.id) as { reservedCostUsd: number };
    expect(retained).toMatchObject({
      status: 'reserved',
      actualCostUsd: null,
      reconciledAt: null,
    });
    expect(retained.reservedCostUsd).toBeCloseTo(
      PRICING.inputPerToken + PRICING.outputPerToken,
      12,
    );
  });

  it('rejects a non-finite computed actual cost', () => {
    const reservation = reserveInvariantFixture('computed-cost-non-finite');
    sqlite
      .prepare(
        `UPDATE ai_budget_reservation
         SET input_per_token = ?, reserved_cost_usd = ?
         WHERE id = ?`,
      )
      .run(1e308, 1e308, reservation.id);

    expect(() =>
      reconcileAiBudgetReservation(sqlite, reservation.id, {
        promptTokens: 2,
        completionTokens: 0,
      }),
    ).toThrow(AiBudgetInvariantError);
    expect(readReservation(reservation.id)).toMatchObject({
      status: 'reserved',
      reservedCostUsd: 1e308,
      actualCostUsd: null,
      reconciledAt: null,
    });
  });

  it('recovers abandoned reservations deterministically and keeps their upper-bound charge', () => {
    reserveAiBudget(sqlite, {
      dispatchIntentId: 'intent-1',
      scheduleId: 'ai-schedule',
      requestKey: 'old-worker',
      ownerToken: 'old-worker',
      model: 'known',
      pricing: PRICING,
      promptTokens: 100,
      maxOutputTokens: 100,
      monthlyBudgetUsd: 1,
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(
      abandonAiReservations(sqlite, {
        dispatchIntentId: 'intent-1',
        currentOwnerToken: 'new-worker',
        now: new Date('2026-07-24T12:01:00.000Z'),
      }),
    ).toBe(1);
    expect(
      sqlite
        .prepare(
          'SELECT status, actual_cost_usd = reserved_cost_usd AS charged FROM ai_budget_reservation',
        )
        .get(),
    ).toEqual({ status: 'abandoned', charged: 1 });
  });
});

describe('scheduled worker failure settlement policy', () => {
  let task: TaskFunction;
  let handle: ReturnType<typeof createDatabaseWithHandle>;
  let requestBudget: AiRequestBudget;

  beforeAll(async () => {
    await import('../../jobs/workers/ai-processing-worker.js');
    task = workerMocks.runWorkerTask.mock.calls[0][0] as TaskFunction;
  });

  beforeEach(async () => {
    handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    const now = new Date().toISOString();
    handle.sqlite
      .prepare(
        "UPDATE automation_schedule SET enabled = 1, cadence_json = ?, next_due_at = ?, updated_at = ? WHERE task = 'ai_processing'",
      )
      .run(JSON.stringify({ kind: 'daily', hour: 3, minute: 0 }), now, now);
    handle.sqlite
      .prepare("UPDATE app_config SET value = '5' WHERE key = 'automation.aiMonthlyBudgetUsd'")
      .run();
    handle.sqlite
      .prepare(
        'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run('ai.modelPricingCache', JSON.stringify({ [DEFAULT_AI_CONFIG.model]: PRICING }), now);
    handle.sqlite
      .prepare(
        "INSERT INTO job (id, type, status, created_at) VALUES ('settlement-job', 'ai_processing', 'running', ?)",
      )
      .run(now);
    handle.sqlite
      .prepare(
        "INSERT INTO dispatch_intent (id, task, operation, job_id, trigger_kind, schedule_id, due_at, status, attempt_count, dispatch_key, created_at, updated_at) VALUES ('settlement-intent', 'ai_processing', 'ai_processing', 'settlement-job', 'schedule', 'automation-ai_processing', ?, 'dispatched', 0, 'settlement-key', ?, ?)",
      )
      .run(now, now, now);
    workerMocks.processBatch.mockImplementation(async (_db, options) => {
      requestBudget = options.requestBudget;
      return {};
    });
    await task(
      {
        db: handle.db,
        sqlite: handle.sqlite,
        jobId: 'settlement-job',
        taskData: {},
        executionToken: 'settlement-owner',
      },
      vi.fn(),
    );
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  const failures: Array<{ name: string; error: unknown; actualCost: number | null }> = [
    ...(['rate_limit', 'quota_exceeded'] as const).map((failureType) => ({
      name: failureType,
      error: new AiExtractionError(failureType, 'Synthetic rejection'),
      actualCost: 0,
    })),
    ...[400, 401, 403, 404, 422].map((status) => ({
      name: `HTTP ${status}`,
      error: { status },
      actualCost: 0,
    })),
    {
      name: 'timeout',
      error: new AiExtractionError('timeout', 'Synthetic timeout'),
      actualCost: null,
    },
    {
      name: 'connection error',
      error: new TypeError('Synthetic connection failure'),
      actualCost: null,
    },
    { name: 'HTTP 500', error: { status: 500 }, actualCost: null },
    { name: 'HTTP 503', error: { status: 503 }, actualCost: null },
    {
      name: 'provider unavailable',
      error: new AiExtractionError('provider_unavailable', 'Synthetic unavailable'),
      actualCost: null,
    },
    { name: 'unknown error', error: new Error('Synthetic unknown failure'), actualCost: null },
    { name: 'string status', error: { status: '400' }, actualCost: null },
    {
      name: 'billed failure',
      error: new AiExtractionError(
        'schema_mismatch',
        'Synthetic invalid response',
        undefined,
        undefined,
        { promptTokens: 10, completionTokens: 4 },
      ),
      actualCost: 10 * PRICING.inputPerToken + 4 * PRICING.outputPerToken,
    },
    {
      name: 'usage takes precedence',
      error: new AiExtractionError(
        'rate_limit',
        'Synthetic billed response',
        undefined,
        undefined,
        { promptTokens: 10, completionTokens: 4 },
      ),
      actualCost: 10 * PRICING.inputPerToken + 4 * PRICING.outputPerToken,
    },
  ];

  it.each(failures)(
    'accounts for $name without releasing unknown spend',
    async ({ error, actualCost }) => {
      const reservation = reserveAiBudget(handle.sqlite, {
        dispatchIntentId: 'settlement-intent',
        scheduleId: 'automation-ai_processing',
        requestKey: 'settlement-request',
        ownerToken: 'settlement-owner',
        model: DEFAULT_AI_CONFIG.model,
        pricing: PRICING,
        promptTokens: 100,
        maxOutputTokens: 50,
        monthlyBudgetUsd: 5,
      });
      await requestBudget.settleFailure(reservation, error);
      const row = handle.sqlite
        .prepare(
          'SELECT status, actual_cost_usd AS actualCostUsd FROM ai_budget_reservation WHERE id = ?',
        )
        .get(reservation.id);
      expect(row).toEqual({
        status: actualCost === null ? 'reserved' : 'reconciled',
        actualCostUsd: actualCost,
      });
      const spend = handle.sqlite
        .prepare(
          "SELECT SUM(CASE WHEN status = 'reserved' THEN reserved_cost_usd ELSE actual_cost_usd END) AS spent FROM ai_budget_reservation WHERE schedule_id = ? AND billing_month = ?",
        )
        .get('automation-ai_processing', reservation.billingMonth) as { spent: number };
      expect(spend.spent).toBeCloseTo(actualCost ?? reservation.reservedCostUsd, 12);
    },
  );

  it('stores a paid batch result even when reported usage exceeds the reservation', async () => {
    const { processBatch: runBatch } = await vi.importActual<{ processBatch: typeof processBatch }>(
      '../batch.js',
    );
    handle.db
      .insert(document)
      .values({
        id: 'paid-document',
        paperlessId: 1,
        title: 'Synthetic input',
        processingStatus: 'completed',
        syncedAt: new Date().toISOString(),
      })
      .run();
    handle.db
      .insert(documentContent)
      .values({
        documentId: 'paid-document',
        fullText: 'Synthetic document content',
        contentHash: 'synthetic-hash',
      })
      .run();
    const reservation = reserveAiBudget(handle.sqlite, {
      dispatchIntentId: 'settlement-intent',
      scheduleId: 'automation-ai_processing',
      requestKey: 'paid-request',
      ownerToken: 'settlement-owner',
      model: DEFAULT_AI_CONFIG.model,
      pricing: PRICING,
      promptTokens: 100,
      maxOutputTokens: 50,
      monthlyBudgetUsd: 5,
    });
    const result = await runBatch(handle.db, {
      provider: {
        provider: 'openai',
        extract: vi.fn().mockResolvedValue({
          response: {
            title: 'Paid synthetic result',
            correspondent: null,
            documentType: null,
            tags: [],
            confidence: { title: 1, correspondent: 0, documentType: 0, tags: 0 },
            evidence: '',
          },
          usage: { promptTokens: 201, completionTokens: 0 },
        }),
      },
      client: {
        getCorrespondents: vi.fn().mockResolvedValue([]),
        getDocumentTypes: vi.fn().mockResolvedValue([]),
        getTags: vi.fn().mockResolvedValue([]),
        getCustomFields: vi.fn().mockResolvedValue([]),
      } as unknown as PaperlessClient,
      config: { ...DEFAULT_AI_CONFIG, rateDelayMs: 0, maxOutputTokens: 50 },
      requestBudget: {
        reserve: vi.fn().mockResolvedValue(reservation),
        reconcile: async (held, usage) => {
          reconcileAiBudgetReservation(handle.sqlite, held.id, usage);
        },
        settleFailure: vi.fn(),
      },
    });
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(handle.db.select().from(aiProcessingResult).get()).toMatchObject({
      suggestedTitle: 'Paid synthetic result',
      promptTokens: 201,
      completionTokens: 0,
      appliedStatus: 'pending_review',
    });
    const held = handle.sqlite
      .prepare(
        'SELECT reserved_cost_usd AS reservedCostUsd FROM ai_budget_reservation WHERE id = ?',
      )
      .get(reservation.id) as { reservedCostUsd: number };
    expect(held.reservedCostUsd).toBeCloseTo(201 * PRICING.inputPerToken, 12);
  });
});

it('counts chat schema, roles, and bounds in the actual request representation', async () => {
  const request = { systemPrompt: 'System', userPrompt: 'Synthetic body', maxOutputTokens: 777 };
  const options = { apiStyle: 'chat' as const, baseURL: 'http://localhost:11434/v1' };
  const { zodResponseFormat } = await import('openai/helpers/zod');
  const { aiExtractionResponseSchema } = await import('../providers/types.js');
  const { encodingForModel } = await import('js-tiktoken');
  const params = await buildOpenAiRequestParams(request, 'gpt-5.4-mini', false, options);
  expect(params.messages).toEqual([
    { role: 'system', content: 'System' },
    { role: 'user', content: 'Synthetic body' },
  ]);
  expect(params.response_format.json_schema.schema).toEqual(
    zodResponseFormat(aiExtractionResponseSchema, 'document_classification').json_schema.schema,
  );
  expect(params).not.toHaveProperty('service_tier');
  expect(await countAiPromptTokens(request, 'gpt-5.4-mini', false, options)).toBe(
    encodingForModel('gpt-5').encode(JSON.stringify(params)).length +
      OPENAI_RESPONSES_FRAMING_ALLOWANCE_TOKENS,
  );
});
