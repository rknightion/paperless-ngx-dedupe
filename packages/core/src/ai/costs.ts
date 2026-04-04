import { eq, sql, isNull, and, isNotNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { appConfig } from '../schema/sqlite/app.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { createLogger } from '../logger.js';
import { OPENAI_MODELS } from './types.js';

const logger = createLogger('ai-costs');

const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const PRICING_CACHE_KEY = 'ai.modelPricingCache';
const PRICING_UPDATED_KEY = 'ai.modelPricingUpdatedAt';
const PRICING_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken: number | null;
  cacheCreationPerToken: number | null;
}

export interface AiCostEstimate {
  estimatedCostUsd: number;
  breakdown: { input: number; output: number };
}

export interface AiCostStats {
  totalCostUsd: number;
  costByProvider: { provider: string; costUsd: number; tokenCount: number }[];
  costByModel: {
    model: string;
    costUsd: number;
    promptTokens: number;
    completionTokens: number;
  }[];
  costOverTime: { date: string; costUsd: number; documentCount: number }[];
}

/** All known model IDs from our provider definitions */
function getKnownModelIds(): string[] {
  return OPENAI_MODELS.map((m) => m.id);
}

/**
 * Fetch model pricing from LiteLLM's public JSON and cache in the database.
 * Best-effort: logs a warning and returns on failure.
 */
export async function fetchAndCachePricing(db: AppDatabase): Promise<void> {
  try {
    const response = await fetch(LITELLM_PRICING_URL);
    if (!response.ok) {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        'Failed to fetch LiteLLM pricing data',
      );
      return;
    }

    const data = (await response.json()) as Record<
      string,
      {
        input_cost_per_token?: number;
        output_cost_per_token?: number;
        cache_read_input_token_cost?: number;
        cache_creation_input_token_cost?: number;
      }
    >;

    const knownIds = getKnownModelIds();
    const pricingMap: Record<string, ModelPricing> = {};

    function toPricing(entry: (typeof data)[string]): ModelPricing {
      return {
        inputPerToken: entry.input_cost_per_token!,
        outputPerToken: entry.output_cost_per_token ?? 0,
        cacheReadPerToken: entry.cache_read_input_token_cost ?? null,
        cacheCreationPerToken: entry.cache_creation_input_token_cost ?? null,
      };
    }

    for (const modelId of knownIds) {
      // Try exact match first
      if (data[modelId] && data[modelId].input_cost_per_token != null) {
        pricingMap[modelId] = toPricing(data[modelId]);
        continue;
      }

      // Try prefix match: find any key that starts with our model ID
      const prefixMatch = Object.keys(data).find(
        (key) => key.startsWith(modelId) && data[key].input_cost_per_token != null,
      );
      if (prefixMatch) {
        pricingMap[modelId] = toPricing(data[prefixMatch]);
        continue;
      }

      // Try with provider prefix using both "/" and "." separators
      const providerSlash = 'openai/';
      const providerDot = 'openai.';

      const slashPrefixed = providerSlash + modelId;
      if (data[slashPrefixed] && data[slashPrefixed].input_cost_per_token != null) {
        pricingMap[modelId] = toPricing(data[slashPrefixed]);
        continue;
      }

      // Try dot-prefixed exact match, then dot-prefixed prefix match
      // (handles keys like "anthropic.claude-opus-4-6-v1")
      const dotPrefixed = providerDot + modelId;
      if (data[dotPrefixed] && data[dotPrefixed].input_cost_per_token != null) {
        pricingMap[modelId] = toPricing(data[dotPrefixed]);
        continue;
      }

      const dotPrefixMatch = Object.keys(data).find(
        (key) => key.startsWith(dotPrefixed) && data[key].input_cost_per_token != null,
      );
      if (dotPrefixMatch) {
        pricingMap[modelId] = toPricing(data[dotPrefixMatch]);
        continue;
      }

      // Last resort: find any key that contains the model ID
      const containsMatch = Object.keys(data).find(
        (key) => key.includes(modelId) && data[key].input_cost_per_token != null,
      );
      if (containsMatch) {
        pricingMap[modelId] = toPricing(data[containsMatch]);
      }
    }

    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.insert(appConfig)
        .values({
          key: PRICING_CACHE_KEY,
          value: JSON.stringify(pricingMap),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: JSON.stringify(pricingMap),
            updatedAt: now,
          },
        })
        .run();

      tx.insert(appConfig)
        .values({
          key: PRICING_UPDATED_KEY,
          value: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: now,
            updatedAt: now,
          },
        })
        .run();
    });

    logger.info({ modelCount: Object.keys(pricingMap).length }, 'Cached LiteLLM model pricing');
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Failed to fetch LiteLLM pricing data');
  }
}

/**
 * Refresh pricing if the cached data is stale (older than 24 hours), missing,
 * or empty (no models matched during a previous fetch).
 */
export async function refreshPricingIfStale(db: AppDatabase): Promise<void> {
  const row = db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, PRICING_UPDATED_KEY))
    .get();

  if (!row) {
    await fetchAndCachePricing(db);
    return;
  }

  // Force re-fetch if the cached map is empty (previous fetch matched no models)
  const pricingMap = getAllModelPricing(db);
  if (!pricingMap || Object.keys(pricingMap).length === 0) {
    await fetchAndCachePricing(db);
    return;
  }

  const updatedAt = new Date(row.value).getTime();
  if (Date.now() - updatedAt > PRICING_REFRESH_INTERVAL_MS) {
    await fetchAndCachePricing(db);
  }
}

/**
 * Look up cached pricing for a specific model.
 * Falls back to the most expensive model in the same provider family if exact match not found.
 */
export function getModelPricing(db: AppDatabase, model: string): ModelPricing | null {
  const row = db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, PRICING_CACHE_KEY))
    .get();

  if (!row) return null;

  let pricingMap: Record<string, ModelPricing>;
  try {
    pricingMap = JSON.parse(row.value);
  } catch {
    return null;
  }

  // Exact match
  if (pricingMap[model]) {
    return pricingMap[model];
  }

  // Fallback: find the most expensive model in the same provider family
  const familyIds = OPENAI_MODELS.some((m) => m.id === model)
    ? OPENAI_MODELS.map((m) => m.id)
    : [];

  let maxCost = 0;
  let fallback: ModelPricing | null = null;
  for (const id of familyIds) {
    const p = pricingMap[id];
    if (p) {
      const totalCost = p.inputPerToken + p.outputPerToken;
      if (totalCost > maxCost) {
        maxCost = totalCost;
        fallback = p;
      }
    }
  }

  return fallback;
}

/**
 * Return the full cached pricing map for all known models.
 * Returns null if no pricing data has been cached yet.
 */
export function getAllModelPricing(db: AppDatabase): Record<string, ModelPricing> | null {
  const row = db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, PRICING_CACHE_KEY))
    .get();

  if (!row) return null;

  try {
    return JSON.parse(row.value) as Record<string, ModelPricing>;
  } catch {
    return null;
  }
}

/**
 * Compute the estimated cost in USD for a single API call.
 */
export function estimateResultCost(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return promptTokens * pricing.inputPerToken + completionTokens * pricing.outputPerToken;
}

/**
 * Estimate the total cost for processing a batch of documents.
 * Uses historical averages for token counts when available, otherwise conservative defaults.
 */
export function estimateBatchCost(
  db: AppDatabase,
  model: string,
  documentCount: number,
): AiCostEstimate | null {
  const pricing = getModelPricing(db, model);
  if (!pricing) return null;

  // Query average token counts from recent successful results for this model
  const avgRow = db
    .select({
      avgPrompt: sql<number>`coalesce(avg(${aiProcessingResult.promptTokens}), 0)`,
      avgCompletion: sql<number>`coalesce(avg(${aiProcessingResult.completionTokens}), 0)`,
    })
    .from(aiProcessingResult)
    .where(
      and(
        eq(aiProcessingResult.model, model),
        isNotNull(aiProcessingResult.promptTokens),
        isNotNull(aiProcessingResult.completionTokens),
        sql`${aiProcessingResult.appliedStatus} != 'failed'`,
      ),
    )
    .get();

  // Use conservative estimates if no historical data
  const avgPrompt = avgRow && avgRow.avgPrompt > 0 ? avgRow.avgPrompt : 2000;
  const avgCompletion = avgRow && avgRow.avgCompletion > 0 ? avgRow.avgCompletion : 200;

  const inputCost = avgPrompt * documentCount * pricing.inputPerToken;
  const outputCost = avgCompletion * documentCount * pricing.outputPerToken;

  return {
    estimatedCostUsd: inputCost + outputCost,
    breakdown: { input: inputCost, output: outputCost },
  };
}

/**
 * Aggregate cost statistics across all AI processing results.
 */
export function getCostStats(db: AppDatabase, days?: number): AiCostStats {
  // Total cost
  const totalRow = db
    .select({
      totalCost: sql<number>`coalesce(sum(${aiProcessingResult.estimatedCostUsd}), 0)`,
    })
    .from(aiProcessingResult)
    .get();

  const totalCostUsd = totalRow?.totalCost ?? 0;

  // Cost by provider
  const providerRows = db
    .select({
      provider: aiProcessingResult.provider,
      costUsd: sql<number>`coalesce(sum(${aiProcessingResult.estimatedCostUsd}), 0)`,
      tokenCount: sql<number>`coalesce(sum(${aiProcessingResult.promptTokens}), 0) + coalesce(sum(${aiProcessingResult.completionTokens}), 0)`,
    })
    .from(aiProcessingResult)
    .groupBy(aiProcessingResult.provider)
    .all();

  const costByProvider = providerRows.map((r) => ({
    provider: r.provider,
    costUsd: r.costUsd,
    tokenCount: r.tokenCount,
  }));

  // Cost by model
  const modelRows = db
    .select({
      model: aiProcessingResult.model,
      costUsd: sql<number>`coalesce(sum(${aiProcessingResult.estimatedCostUsd}), 0)`,
      promptTokens: sql<number>`coalesce(sum(${aiProcessingResult.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${aiProcessingResult.completionTokens}), 0)`,
    })
    .from(aiProcessingResult)
    .groupBy(aiProcessingResult.model)
    .all();

  const costByModel = modelRows.map((r) => ({
    model: r.model,
    costUsd: r.costUsd,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
  }));

  // Cost over time
  const dateCondition = days
    ? sql`${aiProcessingResult.createdAt} >= datetime('now', ${`-${days} days`})`
    : undefined;

  const dateRows = db
    .select({
      date: sql<string>`date(${aiProcessingResult.createdAt})`,
      costUsd: sql<number>`coalesce(sum(${aiProcessingResult.estimatedCostUsd}), 0)`,
      documentCount: sql<number>`count(*)`,
    })
    .from(aiProcessingResult)
    .where(dateCondition)
    .groupBy(sql`date(${aiProcessingResult.createdAt})`)
    .orderBy(sql`date(${aiProcessingResult.createdAt})`)
    .all();

  const costOverTime = dateRows.map((r) => ({
    date: r.date,
    costUsd: r.costUsd,
    documentCount: r.documentCount,
  }));

  return { totalCostUsd, costByProvider, costByModel, costOverTime };
}

/**
 * Backfill estimated_cost_usd for results that have token counts but no cost yet.
 * Returns the number of updated rows.
 */
export function backfillCosts(db: AppDatabase): { updated: number } {
  const rows = db
    .select({
      id: aiProcessingResult.id,
      model: aiProcessingResult.model,
      promptTokens: aiProcessingResult.promptTokens,
      completionTokens: aiProcessingResult.completionTokens,
    })
    .from(aiProcessingResult)
    .where(
      and(
        isNull(aiProcessingResult.estimatedCostUsd),
        isNotNull(aiProcessingResult.promptTokens),
        isNotNull(aiProcessingResult.completionTokens),
      ),
    )
    .all();

  if (rows.length === 0) return { updated: 0 };

  // Cache pricing lookups by model to avoid repeated DB reads
  const pricingCache = new Map<string, ModelPricing | null>();

  let updated = 0;

  db.transaction((tx) => {
    for (const row of rows) {
      if (!pricingCache.has(row.model)) {
        pricingCache.set(row.model, getModelPricing(db, row.model));
      }

      const pricing = pricingCache.get(row.model);
      if (!pricing) continue;

      const cost = estimateResultCost(pricing, row.promptTokens!, row.completionTokens!);

      tx.update(aiProcessingResult)
        .set({ estimatedCostUsd: cost })
        .where(eq(aiProcessingResult.id, row.id))
        .run();

      updated++;
    }
  });

  logger.info({ updated, total: rows.length }, 'Backfilled AI processing costs');

  return { updated };
}
