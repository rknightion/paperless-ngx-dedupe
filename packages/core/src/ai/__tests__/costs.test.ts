import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { appConfig } from '../../schema/sqlite/app.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { DEFAULT_AI_CONFIG, OPENAI_MODELS } from '../types.js';
import { reprocessSingleResult } from '../reprocess.js';
import { AiExtractionError } from '../providers/types.js';
import { type PaperlessClient } from '../../paperless/client.js';
import { estimateProcessingCost } from '../cost-estimate.js';
import {
  fetchAndCachePricing,
  getAllModelPricing,
  getModelPricing,
  getExactModelPricing,
  estimateResultCost,
  estimateBatchCost,
  backfillCosts,
  getCostStats,
} from '../costs.js';

// Tokenization is isolated; pricing and database calculations remain real.
vi.mock('js-tiktoken', () => ({ encodingForModel: () => ({ encode: () => [1, 2, 3, 4] }) }));
let handle: ReturnType<typeof createDatabaseWithHandle>;
let serial: number;
const models = OPENAI_MODELS.map((model) => model.id);
const rates = Object.fromEntries(
  models.map((id, index) => [
    id,
    {
      input_cost_per_token: (index + 1) * 0.000002,
      output_cost_per_token: (models.length - index) * 0.000003,
      cache_read_input_token_cost: 0.0000005,
      cache_creation_input_token_cost: 0.0000025,
    },
  ]),
);
const expectedPrice = (id: string) => ({
  inputPerToken: rates[id].input_cost_per_token,
  outputPerToken: rates[id].output_cost_per_token,
  cacheReadPerToken: rates[id].cache_read_input_token_cost,
  cacheCreationPerToken: rates[id].cache_creation_input_token_cost,
});
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
  serial = 0;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
});
afterEach(() => {
  handle.sqlite.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function cachePrices() {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(rates), { status: 200 }));
  await fetchAndCachePricing(handle.db);
}
function result(values: Partial<typeof aiProcessingResult.$inferInsert> = {}) {
  const id = String(++serial);
  handle.db
    .insert(document)
    .values({
      id,
      paperlessId: serial,
      title: 'Synthetic cost fixture',
      fingerprint: 'synthetic',
      syncedAt: new Date().toISOString(),
    })
    .run();
  handle.db
    .insert(aiProcessingResult)
    .values({
      id,
      documentId: id,
      paperlessId: serial,
      provider: 'openai',
      model: models[0],
      createdAt: new Date().toISOString(),
      ...values,
    })
    .run();
  return id;
}
function changeCache(change: (value: Record<string, unknown>) => unknown) {
  const row = handle.db
    .select()
    .from(appConfig)
    .all()
    .find((row) => row.key.endsWith('modelPricingCache'))!;
  handle.db
    .update(appConfig)
    .set({ value: JSON.stringify(change(JSON.parse(row.value))) })
    .where(eq(appConfig.key, row.key))
    .run();
}
it('caches every known model through the pricing file parser', async () => {
  await cachePrices();
  expect(getAllModelPricing(handle.db)).toEqual(
    Object.fromEntries(models.map((id) => [id, expectedPrice(id)])),
  );
});
it.each(['response', 'rejection'] as const)(
  'preserves cached pricing after a fetch %s failure',
  async (kind) => {
    await cachePrices();
    const before = handle.db.select().from(appConfig).all();
    if (kind === 'response')
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('synthetic network failure'));
    await expect(fetchAndCachePricing(handle.db)).resolves.toBeUndefined();
    expect(handle.db.select().from(appConfig).all()).toEqual(before);
  },
);
it('returns exact prices from both lookup functions', async () => {
  await cachePrices();
  for (const id of models) {
    expect(getModelPricing(handle.db, id)).toEqual(expectedPrice(id));
    expect(getExactModelPricing(handle.db, id)).toEqual(expectedPrice(id));
  }
});
it('falls back to the most expensive cached family member, while exact lookup stays null', async () => {
  await cachePrices();
  const missing = models[models.length - 1];
  changeCache((value) => {
    delete value[missing];
    return value;
  });
  const highest = models
    .filter((id) => id !== missing)
    .sort(
      (a, b) =>
        rates[b].input_cost_per_token +
        rates[b].output_cost_per_token -
        (rates[a].input_cost_per_token + rates[a].output_cost_per_token),
    )[0];
  expect(getModelPricing(handle.db, missing)).toEqual(expectedPrice(highest));
  expect(getExactModelPricing(handle.db, missing)).toBeNull();
  expect(getModelPricing(handle.db, 'unknown-synthetic-model')).toBeNull();
});
it('returns null when the pricing cache is absent', () => {
  expect(getModelPricing(handle.db, models[0])).toBeNull();
  expect(getAllModelPricing(handle.db)).toBeNull();
  expect(getExactModelPricing(handle.db, models[0])).toBeNull();
  expect(estimateBatchCost(handle.db, models[0], 2)).toBeNull();
});
it('returns null when cached pricing is malformed JSON', async () => {
  await cachePrices();
  const row = handle.db
    .select()
    .from(appConfig)
    .all()
    .find((row) => row.key.endsWith('modelPricingCache'))!;
  handle.db.update(appConfig).set({ value: '{broken' }).where(eq(appConfig.key, row.key)).run();
  expect(getModelPricing(handle.db, models[0])).toBeNull();
  expect(getAllModelPricing(handle.db)).toBeNull();
  expect(getExactModelPricing(handle.db, models[0])).toBeNull();
});
it('prices prompt and completion tokens independently', () => {
  const price = expectedPrice(models[0]);
  expect(estimateResultCost(price, 137, 29)).toBeCloseTo(
    137 * price.inputPerToken + 29 * price.outputPerToken,
    12,
  );
});
it('uses positive linear default estimates and a lower flex estimate without history', async () => {
  await cachePrices();
  const two = estimateBatchCost(handle.db, models[0], 2, false)!;
  expect(two.estimatedCostUsd).toBeGreaterThan(0);
  expect(estimateBatchCost(handle.db, models[0], 20, false)!.estimatedCostUsd).toBeCloseTo(
    two.estimatedCostUsd * 10,
    12,
  );
  expect(estimateBatchCost(handle.db, models[0], 2, true)!.estimatedCostUsd).toBeLessThan(
    two.estimatedCostUsd,
  );
});
it('estimates batches from successful token history for the requested model', async () => {
  await cachePrices();
  result({ promptTokens: 100, completionTokens: 20 });
  result({ promptTokens: 300, completionTokens: 60 });
  result({ promptTokens: 9999, completionTokens: 9999, appliedStatus: 'failed' });
  result({ model: models[1], promptTokens: 8888, completionTokens: 8888 });
  const price = expectedPrice(models[0]);
  const estimate = estimateBatchCost(handle.db, models[0], 7, false)!;
  expect(estimate.breakdown.input).toBeCloseTo(7 * 200 * price.inputPerToken, 12);
  expect(estimate.breakdown.output).toBeCloseTo(7 * 40 * price.outputPerToken, 12);
  expect(estimate.estimatedCostUsd).toBeCloseTo(
    7 * (200 * price.inputPerToken + 40 * price.outputPerToken),
    12,
  );
});
it('backfills eligible rows only and skips unpriced models without counting them', async () => {
  await cachePrices();
  const first = result({ promptTokens: 137, completionTokens: 29 });
  const second = result({ model: models[1], promptTokens: 45, completionTokens: 11 });
  const preserved = result({ promptTokens: 10, completionTokens: 10, estimatedCostUsd: 9 });
  const noPrompt = result({ completionTokens: 20 });
  const noCompletion = result({ promptTokens: 20 });
  const unknown = result({
    model: 'unknown-synthetic-model',
    promptTokens: 10,
    completionTokens: 10,
  });
  expect(backfillCosts(handle.db)).toEqual({ updated: 2 });
  const costs = Object.fromEntries(
    handle.db
      .select()
      .from(aiProcessingResult)
      .all()
      .map((row) => [row.id, row.estimatedCostUsd]),
  );
  expect(costs[first]).toBeCloseTo(
    137 * rates[models[0]].input_cost_per_token + 29 * rates[models[0]].output_cost_per_token,
    12,
  );
  expect(costs[second]).toBeCloseTo(
    45 * rates[models[1]].input_cost_per_token + 11 * rates[models[1]].output_cost_per_token,
    12,
  );
  expect(costs[preserved]).toBe(9);
  for (const id of [noPrompt, noCompletion, unknown]) expect(costs[id]).toBeNull();
  expect(backfillCosts(handle.db)).toEqual({ updated: 0 });
});
it('aggregates stored costs and excludes older rows from the requested trend window', () => {
  const recent = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  result({ estimatedCostUsd: 1.25, promptTokens: 100, completionTokens: 20, createdAt: recent });
  result({ estimatedCostUsd: 2.5, promptTokens: 300, completionTokens: 40, createdAt: old });
  const all = getCostStats(handle.db);
  expect(all.totalCostUsd).toBeCloseTo(3.75);
  expect(all.costByProvider).toEqual([{ provider: 'openai', costUsd: 3.75, tokenCount: 460 }]);
  expect(all.costByModel).toEqual([
    { model: models[0], costUsd: 3.75, promptTokens: 400, completionTokens: 60 },
  ]);
  expect(all.costOverTime).toHaveLength(2);
  expect(getCostStats(handle.db, 7).costOverTime).toEqual([
    { date: recent.slice(0, 10), costUsd: 1.25, documentCount: 1 },
  ]);
});
it('estimates unprocessed documents locally with a stub tokenizer and real pricing', async () => {
  await cachePrices();
  result({ completionTokens: 40 });
  for (const id of ['unprocessed-a', 'unprocessed-b']) {
    handle.db
      .insert(document)
      .values({
        id,
        paperlessId: ++serial,
        title: 'Synthetic estimate fixture',
        fingerprint: 'synthetic',
        syncedAt: new Date().toISOString(),
      })
      .run();
    handle.db
      .insert(documentContent)
      .values({ documentId: id, fullText: 'a'.repeat(100), wordCount: 1 })
      .run();
  }
  const estimate = await estimateProcessingCost(handle.db, {
    config: { ...DEFAULT_AI_CONFIG, model: models[0], flexProcessing: false },
    existingCorrespondents: [],
    existingDocumentTypes: [],
    existingTags: [],
  });
  expect(estimate).toMatchObject({
    documentCount: 2,
    tokenBreakdown: { systemPromptTokens: 4, totalUserPromptTokens: 75, avgCompletionTokens: 40 },
  });
  const price = expectedPrice(models[0]);
  expect(estimate!.currentModel.worstCase.totalCostUsd).toBeCloseTo(
    (4 * 2 + 75) * price.inputPerToken + 80 * price.outputPerToken,
    12,
  );
  expect(estimate!.currentModel.bestCase.totalCostUsd).toBeCloseTo(
    4 * price.cacheCreationPerToken! +
      4 * price.cacheReadPerToken! +
      75 * price.inputPerToken +
      80 * price.outputPerToken,
    12,
  );
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});
it('limits cost totals and groupings to the requested window', () => {
  result({ estimatedCostUsd: 1.25, promptTokens: 100, completionTokens: 20 });
  result({
    estimatedCostUsd: 2.5,
    promptTokens: 300,
    completionTokens: 40,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  });
  const stats = getCostStats(handle.db, 7);
  expect.soft(stats.totalCostUsd).toBeCloseTo(1.25);
  expect
    .soft(stats.costByProvider)
    .toEqual([{ provider: 'openai', costUsd: 1.25, tokenCount: 120 }]);
  expect
    .soft(stats.costByModel)
    .toEqual([{ model: models[0], costUsd: 1.25, promptTokens: 100, completionTokens: 20 }]);
});

it('uses one exact rolling cutoff for ISO and SQLite timestamps', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-15T12:00:00.000Z'));
  result({ estimatedCostUsd: 9, createdAt: '2030-01-08T11:59:59.999Z' });
  result({
    estimatedCostUsd: 1.25,
    promptTokens: 100,
    completionTokens: 20,
    createdAt: '2030-01-08T12:00:00.000Z',
  });
  result({
    estimatedCostUsd: 2.5,
    promptTokens: 200,
    completionTokens: 40,
    createdAt: '2030-01-08 12:00:00',
  });
  const stats = getCostStats(handle.db, 7);
  expect(stats).toEqual({
    totalCostUsd: 3.75,
    costByProvider: [{ provider: 'openai', costUsd: 3.75, tokenCount: 360 }],
    costByModel: [{ model: models[0], costUsd: 3.75, promptTokens: 300, completionTokens: 60 }],
    costOverTime: [{ date: '2030-01-08', costUsd: 3.75, documentCount: 2 }],
  });
  expect(getCostStats(handle.db).totalCostUsd).toBe(12.75);
  expect(getCostStats(handle.db, 1)).toEqual({
    totalCostUsd: 0,
    costByProvider: [],
    costByModel: [],
    costOverTime: [],
  });
});

it.each([
  [undefined, 0.00625],
  [{ flex: false }, 0.00625],
  [{ flex: true }, 0.003125],
  [{ cachedTokens: 2000 }, 0.00325],
  [{ cachedTokens: 2000, flex: true }, 0.001625],
  [{ cachedTokens: 4000 }, 0.00175],
  [{ cachedTokens: 0 }, 0.00625],
])('prices cached tokens and the served tier with options %j', (options, expected) => {
  const price = {
    inputPerToken: 0.000002,
    outputPerToken: 0.000005,
    cacheReadPerToken: 0.0000005,
    cacheCreationPerToken: null,
  };
  expect(estimateResultCost(price, 3000, 50, options)).toBeCloseTo(expected, 12);
});

it('prices cached tokens at the input rate when there is no cache-read price', () => {
  const price = {
    inputPerToken: 0.000002,
    outputPerToken: 0.000005,
    cacheReadPerToken: null,
    cacheCreationPerToken: null,
  };
  expect(estimateResultCost(price, 3000, 50, { cachedTokens: 2000, flex: true })).toBeCloseTo(
    0.003125,
    12,
  );
});

it.each(['success', 'failure'] as const)(
  'records served-tier cost and usage for a single reprocess %s',
  async (outcome) => {
    await cachePrices();
    const id = result({ appliedStatus: 'pending_review' });
    handle.db
      .insert(documentContent)
      .values({ documentId: id, fullText: 'Synthetic document content', contentHash: 'synthetic' })
      .run();
    const usage = {
      promptTokens: 3000,
      completionTokens: 50,
      cachedTokens: 2000,
      serviceTier: 'flex',
    };
    const error = new AiExtractionError(
      'schema_mismatch',
      'Synthetic schema failure',
      undefined,
      undefined,
      usage,
    );
    const extract =
      outcome === 'failure'
        ? vi.fn().mockRejectedValue(error)
        : vi.fn().mockResolvedValue({
            response: {
              title: 'Synthetic title',
              correspondent: null,
              documentType: null,
              tags: [],
              customFields: [],
              confidence: { title: 0.9, correspondent: 0, documentType: 0, tags: 0 },
              evidence: 'Synthetic evidence',
            },
            usage,
          });
    const operation = reprocessSingleResult(handle.db, id, {
      provider: { provider: 'openai', extract },
      client: {} as PaperlessClient,
      config: {
        ...DEFAULT_AI_CONFIG,
        model: models[0],
        flexProcessing: false,
        includeCorrespondents: false,
        includeDocumentTypes: false,
        includeTags: false,
        extractCustomFields: false,
      },
    });
    if (outcome === 'failure') await expect(operation).rejects.toBe(error);
    else await expect(operation).resolves.toEqual({ resultId: id });
    const row = handle.db
      .select()
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.id, id))
      .get()!;
    const price = expectedPrice(models[0]);
    expect(row).toMatchObject({
      appliedStatus: outcome === 'failure' ? 'failed' : 'pending_review',
      promptTokens: 3000,
      completionTokens: 50,
    });
    expect(row.estimatedCostUsd).toBeCloseTo(
      (1000 * price.inputPerToken + 2000 * price.cacheReadPerToken + 50 * price.outputPerToken) *
        0.5,
      12,
    );
  },
);
