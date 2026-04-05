import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import type { AiProviderInterface } from './providers/types.js';
import { AiExtractionError } from './providers/types.js';
import { processDocument } from './extract.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { getModelPricing, estimateResultCost } from './costs.js';
import { markAiResultFailed } from './queries.js';
import type { AiConfig } from './types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ai-reprocess');

export interface ReprocessSingleResultOptions {
  provider: AiProviderInterface;
  client: PaperlessClient;
  config: AiConfig;
}

/**
 * Re-run AI extraction for a single failed result.
 * Sends the document back to OpenAI, updates the result row in place,
 * and resets it to `pending_review` status.
 */
export async function reprocessSingleResult(
  db: AppDatabase,
  resultId: string,
  options: ReprocessSingleResultOptions,
): Promise<{ resultId: string }> {
  const { provider, client, config } = options;

  // 1. Look up existing result
  const row = db
    .select({
      id: aiProcessingResult.id,
      documentId: aiProcessingResult.documentId,
      paperlessId: aiProcessingResult.paperlessId,
    })
    .from(aiProcessingResult)
    .where(eq(aiProcessingResult.id, resultId))
    .get();

  if (!row) throw new Error(`AI result not found: ${resultId}`);

  // 2. Load document metadata
  const doc = db
    .select({
      id: document.id,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
    })
    .from(document)
    .where(eq(document.id, row.documentId))
    .get();

  if (!doc) throw new Error(`Document not found: ${row.documentId}`);

  // 3. Load document content
  const content = db
    .select({ fullText: documentContent.fullText })
    .from(documentContent)
    .where(eq(documentContent.documentId, row.documentId))
    .get();

  if (!content?.fullText) {
    throw new Error(`No content available for document: ${row.documentId}`);
  }

  // 4. Fetch reference data from Paperless per config toggles
  const [correspondentNames, documentTypeNames, tagNames] = await Promise.all([
    config.includeCorrespondents
      ? client.getCorrespondents().then((list) => list.map((c) => c.name))
      : Promise.resolve([] as string[]),
    config.includeDocumentTypes
      ? client.getDocumentTypes().then((list) => list.map((dt) => dt.name))
      : Promise.resolve([] as string[]),
    config.includeTags
      ? client.getTags().then((list) => list.map((t) => t.name))
      : Promise.resolve([] as string[]),
  ]);

  // 5. Run extraction
  const startMs = performance.now();
  let extraction;
  try {
    extraction = await processDocument({
      provider,
      documentTitle: doc.title,
      documentContent: content.fullText,
      existingCorrespondents: correspondentNames,
      existingDocumentTypes: documentTypeNames,
      existingTags: tagNames,
      promptTemplate: config.promptTemplate,
      maxContentLength: config.maxContentLength,
      includeCorrespondents: config.includeCorrespondents,
      includeDocumentTypes: config.includeDocumentTypes,
      includeTags: config.includeTags,
      tagAliasesEnabled: config.tagAliasesEnabled,
      tagAliasMap: config.tagAliasMap,
      reasoningEffort: config.reasoningEffort,
    });
  } catch (error) {
    const isAiError = error instanceof AiExtractionError;
    const errorMsg = isAiError
      ? `[${error.failureType}] ${error.message}`
      : (error as Error).message;
    const failureType = isAiError ? error.failureType : null;

    markAiResultFailed(db, resultId, errorMsg, failureType ?? undefined);
    logger.error({ resultId, error: errorMsg }, 'Reprocess extraction failed');
    throw error;
  }

  const docDurationMs = Math.round(performance.now() - startMs);

  // 6. Normalize suggestions
  const normalizedTitle = normalizeSuggestedLabel(extraction.response.title);
  const normalizedCorrespondent = normalizeSuggestedLabel(extraction.response.correspondent);
  const normalizedDocumentType = normalizeSuggestedLabel(extraction.response.documentType);
  const normalizedTags = normalizeSuggestedTags(extraction.response.tags);

  // 7. Compute cost
  const pricing = getModelPricing(db, config.model);
  const estimatedCostUsd = pricing
    ? estimateResultCost(pricing, extraction.usage.promptTokens, extraction.usage.completionTokens)
    : null;

  // 8. Update existing result row
  const now = new Date().toISOString();
  db.update(aiProcessingResult)
    .set({
      provider: provider.provider,
      model: config.model,
      suggestedTitle: normalizedTitle,
      suggestedCorrespondent: normalizedCorrespondent,
      suggestedDocumentType: normalizedDocumentType,
      suggestedTagsJson: JSON.stringify(normalizedTags),
      confidenceJson: JSON.stringify(extraction.response.confidence),
      currentTitle: doc.title,
      currentCorrespondent: doc.correspondent,
      currentDocumentType: doc.documentType,
      currentTagsJson: doc.tagsJson,
      appliedStatus: 'pending_review',
      appliedAt: null,
      appliedFieldsJson: null,
      evidence: extraction.response.evidence || null,
      failureType: null,
      rawResponseJson: JSON.stringify(extraction.response),
      promptTokens: extraction.usage.promptTokens,
      completionTokens: extraction.usage.completionTokens,
      estimatedCostUsd,
      errorMessage: null,
      processingTimeMs: docDurationMs,
      createdAt: now,
    })
    .where(eq(aiProcessingResult.id, resultId))
    .run();

  logger.info(
    { resultId, paperlessId: row.paperlessId, durationMs: docDurationMs },
    'Reprocessed AI result successfully',
  );

  return { resultId };
}
