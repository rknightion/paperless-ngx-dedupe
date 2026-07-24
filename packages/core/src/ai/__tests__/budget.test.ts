import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { beforeEach, describe, expect, it } from 'vitest';

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
