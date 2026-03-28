import { sql, eq, isNull, and, isNotNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { buildPromptParts } from './prompt.js';
import { OPENAI_MODELS, ANTHROPIC_MODELS } from './types.js';
import { getAllModelPricing } from './costs.js';
import type { ModelPricing } from './costs.js';
import type { AiConfig } from './types.js';

export interface ModelCostEstimate {
  modelId: string;
  modelName: string;
  provider: 'openai' | 'anthropic';
  bestCase: { totalCostUsd: number; perDocumentCostUsd: number };
  worstCase: { totalCostUsd: number; perDocumentCostUsd: number };
  hasCachePricing: boolean;
}

export interface DetailedCostEstimate {
  documentCount: number;
  currentModel: ModelCostEstimate;
  allModels: ModelCostEstimate[];
  tokenBreakdown: {
    systemPromptTokens: number;
    totalUserPromptTokens: number;
    avgCompletionTokens: number;
  };
}

export interface EstimateProcessingCostOptions {
  config: AiConfig;
  existingCorrespondents: string[];
  existingDocumentTypes: string[];
  existingTags: string[];
}

/** Map model IDs to tiktoken model names for encoding selection */
function getTiktokenModel(modelId: string): string {
  if (OPENAI_MODELS.some((m) => m.id === modelId)) {
    return 'gpt-4o'; // o200k_base encoding, closest match for GPT-5.4 family
  }
  // Anthropic models use a similar tokenizer; cl100k_base is a close approximation
  return 'gpt-4'; // cl100k_base encoding
}

/**
 * Count tokens using js-tiktoken. Loaded lazily via dynamic import to avoid
 * pulling the WASM module into worker processes that don't need it.
 */
async function countTokens(text: string, modelId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { encodingForModel } = (await import('js-tiktoken')) as any;
  const enc = encodingForModel(getTiktokenModel(modelId));
  return enc.encode(text).length;
}

function computeModelEstimate(
  modelId: string,
  modelName: string,
  provider: 'openai' | 'anthropic',
  pricing: ModelPricing,
  systemPromptTokens: number,
  totalUserPromptTokens: number,
  avgCompletionTokens: number,
  documentCount: number,
): ModelCostEstimate {
  const totalInputTokens = systemPromptTokens * documentCount + totalUserPromptTokens;
  const totalOutputTokens = avgCompletionTokens * documentCount;

  // Worst case: no caching at all
  const worstCost =
    totalInputTokens * pricing.inputPerToken + totalOutputTokens * pricing.outputPerToken;

  // Best case: system prompt cached after first request
  // First request: full price (or cache creation price) for system prompt
  // Subsequent requests: cache read price for system prompt
  const hasCachePricing = pricing.cacheReadPerToken != null;
  let bestCost: number;

  if (hasCachePricing && documentCount > 1) {
    const firstReqCreationPrice = pricing.cacheCreationPerToken ?? pricing.inputPerToken;
    const firstReqSystemCost = systemPromptTokens * firstReqCreationPrice;
    const cachedSystemCost = systemPromptTokens * (documentCount - 1) * pricing.cacheReadPerToken!;
    const userPromptCost = totalUserPromptTokens * pricing.inputPerToken;
    const outputCost = totalOutputTokens * pricing.outputPerToken;
    bestCost = firstReqSystemCost + cachedSystemCost + userPromptCost + outputCost;
  } else if (hasCachePricing && documentCount === 1) {
    // Single doc: cache creation on first (and only) request
    const creationPrice = pricing.cacheCreationPerToken ?? pricing.inputPerToken;
    bestCost =
      systemPromptTokens * creationPrice +
      totalUserPromptTokens * pricing.inputPerToken +
      totalOutputTokens * pricing.outputPerToken;
  } else {
    bestCost = worstCost;
  }

  return {
    modelId,
    modelName,
    provider,
    bestCase: {
      totalCostUsd: bestCost,
      perDocumentCostUsd: documentCount > 0 ? bestCost / documentCount : 0,
    },
    worstCase: {
      totalCostUsd: worstCost,
      perDocumentCostUsd: documentCount > 0 ? worstCost / documentCount : 0,
    },
    hasCachePricing,
  };
}

/**
 * Compute detailed cost estimates for processing all unprocessed documents.
 * Uses js-tiktoken for accurate system prompt tokenization and SQL aggregates
 * for user prompt estimation.
 */
export async function estimateProcessingCost(
  db: AppDatabase,
  options: EstimateProcessingCostOptions,
): Promise<DetailedCostEstimate | null> {
  const { config } = options;

  const pricingMap = getAllModelPricing(db);
  if (!pricingMap) return null;

  // Count unprocessed documents
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(isNull(aiProcessingResult.id))
    .get();
  const documentCount = countResult?.count ?? 0;

  if (documentCount === 0) return null;

  // Build system prompt with reference data to get accurate token count
  const { systemPrompt } = buildPromptParts({
    promptTemplate: config.promptTemplate,
    documentTitle: '',
    documentContent: '',
    existingCorrespondents: options.existingCorrespondents,
    existingDocumentTypes: options.existingDocumentTypes,
    existingTags: options.existingTags,
    includeCorrespondents: config.includeCorrespondents,
    includeDocumentTypes: config.includeDocumentTypes,
    includeTags: config.includeTags,
    provider: config.provider,
  });
  const systemPromptTokens = await countTokens(systemPrompt, config.model);

  // Aggregate user prompt character count for unprocessed documents
  // Each document's content is capped at maxContentLength, plus ~50 chars overhead for title + wrapping
  const charResult = db
    .select({
      totalChars: sql<number>`COALESCE(SUM(MIN(LENGTH(${documentContent.fullText}), ${config.maxContentLength}) + 50), 0)`,
    })
    .from(document)
    .innerJoin(documentContent, eq(document.id, documentContent.documentId))
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(and(isNull(aiProcessingResult.id), isNotNull(documentContent.fullText)))
    .get();
  const totalUserPromptTokens = Math.ceil((charResult?.totalChars ?? 0) / 4);

  // Historical average completion tokens
  const avgRow = db
    .select({
      avgCompletion: sql<number>`COALESCE(AVG(${aiProcessingResult.completionTokens}), 0)`,
    })
    .from(aiProcessingResult)
    .where(
      and(
        isNotNull(aiProcessingResult.completionTokens),
        sql`${aiProcessingResult.appliedStatus} != 'failed'`,
      ),
    )
    .get();
  const avgCompletionTokens = avgRow && avgRow.avgCompletion > 0 ? avgRow.avgCompletion : 300;

  // Compute estimates for all models
  const allModels: ModelCostEstimate[] = [];

  for (const model of OPENAI_MODELS) {
    const pricing = pricingMap[model.id];
    if (!pricing) continue;
    allModels.push(
      computeModelEstimate(
        model.id,
        model.name,
        'openai',
        pricing,
        systemPromptTokens,
        totalUserPromptTokens,
        avgCompletionTokens,
        documentCount,
      ),
    );
  }

  for (const model of ANTHROPIC_MODELS) {
    const pricing = pricingMap[model.id];
    if (!pricing) continue;
    allModels.push(
      computeModelEstimate(
        model.id,
        model.name,
        'anthropic',
        pricing,
        systemPromptTokens,
        totalUserPromptTokens,
        avgCompletionTokens,
        documentCount,
      ),
    );
  }

  const currentModel = allModels.find((m) => m.modelId === config.model);
  if (!currentModel) return null;

  return {
    documentCount,
    currentModel,
    allModels,
    tokenBreakdown: {
      systemPromptTokens,
      totalUserPromptTokens,
      avgCompletionTokens,
    },
  };
}
