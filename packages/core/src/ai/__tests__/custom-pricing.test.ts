import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { getAiConfig, setAiConfig } from '../config.js';
import {
  estimateBatchCost,
  estimateResultCost,
  getExactModelPricing,
  getModelPricing,
  refreshPricingIfStale,
} from '../costs.js';
import { OPENAI_MODELS } from '../types.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
  vi.stubEnv('AI_OPENAI_BASE_URL', '');
});
afterEach(() => {
  handle.sqlite.close();
  vi.unstubAllEnvs();
});

it('persists custom per-million prices and uses them only for an unpriced model', () => {
  setAiConfig(handle.db, { customInputPricePerMTok: 2.5, customOutputPricePerMTok: 7 });
  expect(getAiConfig(handle.db)).toMatchObject({
    customInputPricePerMTok: 2.5,
    customOutputPricePerMTok: 7,
  });
  const pricing = getModelPricing(handle.db, 'synthetic-local-model');
  expect(pricing).toEqual({
    inputPerToken: 0.0000025,
    outputPerToken: 0.000007,
    cacheReadPerToken: null,
    cacheCreationPerToken: null,
  });
  expect(getExactModelPricing(handle.db, 'synthetic-local-model')).toEqual(pricing);
  expect(getExactModelPricing(handle.db, 'gpt-5.4-mini')).toEqual(pricing);
  expect(estimateResultCost(pricing!, 1_000_000, 2_000_000)).toBe(16.5);
  handle.sqlite
    .prepare(
      "INSERT INTO app_config (key,value,updated_at) VALUES ('ai.modelPricingCache',?, '2026-01-01')",
    )
    .run(
      JSON.stringify({
        'synthetic-local-model': {
          inputPerToken: 0.00001,
          outputPerToken: 0.00002,
          cacheReadPerToken: null,
          cacheCreationPerToken: null,
        },
      }),
    );
  expect(getModelPricing(handle.db, 'synthetic-local-model')?.inputPerToken).toBe(0.00001);
  expect(getExactModelPricing(handle.db, 'synthetic-local-model')?.outputPerToken).toBe(0.00002);
});

it('permits zero custom pricing only with an explicit server and preserves built-in missing-price guards', () => {
  expect(getAiConfig(handle.db)).toMatchObject({
    customInputPricePerMTok: 0,
    customOutputPricePerMTok: 0,
  });
  expect(getExactModelPricing(handle.db, 'synthetic-local-model')).toBeNull();
  expect(getExactModelPricing(handle.db, 'gpt-5.4-mini')).toBeNull();
  vi.stubEnv('AI_OPENAI_BASE_URL', 'http://127.0.0.1:11434/v1');
  expect(getExactModelPricing(handle.db, 'synthetic-local-model')).toMatchObject({
    inputPerToken: 0,
    outputPerToken: 0,
  });
  expect(getExactModelPricing(handle.db, 'gpt-5.4-mini')).toMatchObject({
    inputPerToken: 0,
    outputPerToken: 0,
  });
  for (const value of [-1, Infinity, NaN]) {
    expect(() => setAiConfig(handle.db, { customInputPricePerMTok: value })).toThrow();
    expect(() => setAiConfig(handle.db, { customOutputPricePerMTok: value })).toThrow();
  }
  expect(getAiConfig(handle.db).customInputPricePerMTok).toBe(0);
});

it('reserves and reconciles custom-server requests at zero or configured prices', async () => {
  const {
    countAiPromptTokens,
    reserveAiBudget,
    reconcileAiBudgetReservation,
    UnsupportedAiModelEncodingError,
  } = await import('../budget.js');
  const { buildOpenAiRequestParams } = await import('../providers/openai.js');
  const request = {
    systemPrompt: 'Synthetic classification',
    userPrompt: 'Synthetic 文書 🙂',
    maxOutputTokens: 100,
  };
  const options = { baseURL: 'http://127.0.0.1:11434/v1', apiStyle: 'chat' as const };
  vi.stubEnv('AI_OPENAI_BASE_URL', options.baseURL);
  const tokens = await countAiPromptTokens(request, 'synthetic-local-model', true, options);
  expect(tokens).toBe(
    Buffer.byteLength(
      JSON.stringify(
        await buildOpenAiRequestParams(request, 'synthetic-local-model', true, options),
      ),
      'utf8',
    ) + 32,
  );
  await expect(countAiPromptTokens(request, 'synthetic-local-model', false)).rejects.toBeInstanceOf(
    UnsupportedAiModelEncodingError,
  );
  for (const [name, inputPrice, outputPrice] of [
    ['free', 0, 0],
    ['paid', 2, 4],
  ] as const) {
    setAiConfig(handle.db, {
      customInputPricePerMTok: inputPrice,
      customOutputPricePerMTok: outputPrice,
    });
    const reservation = reserveAiBudget(handle.sqlite, {
      dispatchIntentId: 'synthetic-intent',
      scheduleId: 'synthetic-schedule',
      requestKey: name,
      ownerToken: 'synthetic-owner',
      model: 'synthetic-local-model',
      pricing: getExactModelPricing(handle.db, 'synthetic-local-model'),
      promptTokens: tokens,
      maxOutputTokens: 100,
      monthlyBudgetUsd: 1,
    });
    expect(reservation.reservedCostUsd).toBeCloseTo(
      (tokens * inputPrice + 100 * outputPrice) / 1_000_000,
      12,
    );
    expect(
      reconcileAiBudgetReservation(handle.sqlite, reservation.id, {
        promptTokens: 12,
        completionTokens: 8,
      }),
    ).toBe(true);
    expect(
      handle.sqlite
        .prepare('SELECT status, actual_cost_usd AS cost FROM ai_budget_reservation WHERE id=?')
        .get(reservation.id),
    ).toEqual({ status: 'reconciled', cost: (12 * inputPrice + 8 * outputPrice) / 1_000_000 });
  }
});

const GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/openai';
const PRICE = {
  inputPerToken: 0.000001,
  outputPerToken: 0.000002,
  cacheReadPerToken: null,
  cacheCreationPerToken: null,
};

function cachePricing(ids: readonly string[], ageMs: number) {
  const statement = handle.sqlite.prepare(
    'INSERT OR REPLACE INTO app_config (key,value,updated_at) VALUES (?,?,?)',
  );
  const now = new Date().toISOString();
  statement.run(
    'ai.modelPricingCache',
    JSON.stringify(Object.fromEntries(ids.map((id) => [id, PRICE]))),
    now,
  );
  statement.run('ai.modelPricingUpdatedAt', new Date(Date.now() - ageMs).toISOString(), now);
}

it('keeps the missing-price guard when calls reach OpenAI through a gateway', () => {
  vi.stubEnv('AI_OPENAI_BASE_URL', GATEWAY_URL);
  expect(getExactModelPricing(handle.db, 'gpt-6-luna')).toBeNull();
});

it('applies the Flex discount only to models that still offer Flex', () => {
  cachePricing(['gpt-6-luna', 'gpt-6.2-sol'], 0);
  const luna = estimateBatchCost(handle.db, 'gpt-6-luna', 10, true)!.estimatedCostUsd;
  const lunaStandard = estimateBatchCost(handle.db, 'gpt-6-luna', 10, false)!.estimatedCostUsd;
  const sol = estimateBatchCost(handle.db, 'gpt-6.2-sol', 10, true)!.estimatedCostUsd;
  const solStandard = estimateBatchCost(handle.db, 'gpt-6.2-sol', 10, false)!.estimatedCostUsd;
  expect(luna).toBeCloseTo(lunaStandard / 2);
  expect(sol).toBe(solStandard);
});

it.each([
  ['a model added since the last fetch, after an hour', 'missing', 2 * 60 * 60 * 1000, 1],
  ['a model added since the last fetch, within the hour', 'missing', 10 * 60 * 1000, 0],
  ['a complete cache younger than a day', 'complete', 2 * 60 * 60 * 1000, 0],
  ['a complete cache older than a day', 'complete', 25 * 60 * 60 * 1000, 1],
])('refreshes pricing for %s', async (_name, coverage, ageMs, fetches) => {
  const ids = OPENAI_MODELS.map((model) => model.id);
  cachePricing(coverage === 'complete' ? ids : ids.slice(1), ageMs);
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    await refreshPricingIfStale(handle.db);
  } finally {
    vi.unstubAllGlobals();
  }
  expect(fetchMock).toHaveBeenCalledTimes(fetches);
});
