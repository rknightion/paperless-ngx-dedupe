import { eq, inArray, sql } from 'drizzle-orm';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { type AiProviderInterface, AiExtractionError } from './providers/types.js';
import { processDocument } from './extract.js';
import { createLogger } from '../logger.js';
import type { AiBatchResult } from './types.js';
import type { AiConfig } from './types.js';

const logger = createLogger('ai-batch');

export interface BatchProcessOptions {
  provider: AiProviderInterface;
  client: PaperlessClient;
  config: AiConfig;
  reprocess?: boolean;
  documentIds?: string[];
  onProgress?: (progress: number, message: string) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processBatch(
  db: AppDatabase,
  options: BatchProcessOptions,
): Promise<AiBatchResult> {
  const startMs = performance.now();
  const { provider, client, config, reprocess = false, documentIds, onProgress } = options;

  // Fetch reference data from Paperless-NGX only when the corresponding toggle is enabled
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

  // Build document query
  let docs;
  if (documentIds && documentIds.length > 0) {
    docs = db
      .select({
        id: document.id,
        paperlessId: document.paperlessId,
        title: document.title,
        correspondent: document.correspondent,
        documentType: document.documentType,
        tagsJson: document.tagsJson,
        fullText: documentContent.fullText,
      })
      .from(document)
      .leftJoin(documentContent, eq(document.id, documentContent.documentId))
      .where(inArray(document.id, documentIds))
      .all();
  } else if (reprocess) {
    docs = db
      .select({
        id: document.id,
        paperlessId: document.paperlessId,
        title: document.title,
        correspondent: document.correspondent,
        documentType: document.documentType,
        tagsJson: document.tagsJson,
        fullText: documentContent.fullText,
      })
      .from(document)
      .leftJoin(documentContent, eq(document.id, documentContent.documentId))
      .all();
  } else {
    // Only documents without an existing AI result
    const existingIds = db
      .select({ documentId: aiProcessingResult.documentId })
      .from(aiProcessingResult)
      .all()
      .map((r) => r.documentId);

    const baseQuery = db
      .select({
        id: document.id,
        paperlessId: document.paperlessId,
        title: document.title,
        correspondent: document.correspondent,
        documentType: document.documentType,
        tagsJson: document.tagsJson,
        fullText: documentContent.fullText,
      })
      .from(document)
      .leftJoin(documentContent, eq(document.id, documentContent.documentId));

    if (existingIds.length > 0) {
      docs = baseQuery
        .where(
          sql`${document.id} NOT IN (${sql.join(
            existingIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .all();
    } else {
      docs = baseQuery.all();
    }
  }

  const totalDocs = docs.length;
  const result: AiBatchResult = {
    totalDocuments: totalDocs,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    durationMs: 0,
  };

  if (totalDocs === 0) {
    result.durationMs = Math.round(performance.now() - startMs);
    return result;
  }

  await onProgress?.(0, `Starting AI processing of ${totalDocs} documents...`);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];

    if (!doc.fullText) {
      result.skipped++;
      result.processed++;
      await onProgress?.(result.processed / totalDocs, `Skipped ${doc.title} (no content)`);
      continue;
    }

    try {
      const extraction = await processDocument({
        provider,
        documentTitle: doc.title,
        documentContent: doc.fullText,
        existingCorrespondents: correspondentNames,
        existingDocumentTypes: documentTypeNames,
        existingTags: tagNames,
        promptTemplate: config.promptTemplate,
        maxContentLength: config.maxContentLength,
        includeCorrespondents: config.includeCorrespondents,
        includeDocumentTypes: config.includeDocumentTypes,
        includeTags: config.includeTags,
        reasoningEffort: config.reasoningEffort,
      });

      const now = new Date().toISOString();

      // Upsert result
      db.insert(aiProcessingResult)
        .values({
          documentId: doc.id,
          paperlessId: doc.paperlessId,
          provider: provider.provider,
          model: config.model,
          suggestedCorrespondent: extraction.response.correspondent,
          suggestedDocumentType: extraction.response.documentType,
          suggestedTagsJson: JSON.stringify(extraction.response.tags),
          confidenceJson: JSON.stringify(extraction.response.confidence),
          currentCorrespondent: doc.correspondent,
          currentDocumentType: doc.documentType,
          currentTagsJson: doc.tagsJson,
          appliedStatus: 'pending',
          promptTokens: extraction.usage.promptTokens,
          completionTokens: extraction.usage.completionTokens,
          processingTimeMs: 0,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: aiProcessingResult.documentId,
          set: {
            provider: provider.provider,
            model: config.model,
            suggestedCorrespondent: extraction.response.correspondent,
            suggestedDocumentType: extraction.response.documentType,
            suggestedTagsJson: JSON.stringify(extraction.response.tags),
            confidenceJson: JSON.stringify(extraction.response.confidence),
            currentCorrespondent: doc.correspondent,
            currentDocumentType: doc.documentType,
            currentTagsJson: doc.tagsJson,
            appliedStatus: 'pending',
            appliedAt: null,
            appliedFieldsJson: null,
            promptTokens: extraction.usage.promptTokens,
            completionTokens: extraction.usage.completionTokens,
            errorMessage: null,
            createdAt: now,
          },
        })
        .run();

      result.succeeded++;
      result.totalPromptTokens += extraction.usage.promptTokens;
      result.totalCompletionTokens += extraction.usage.completionTokens;
    } catch (error) {
      const isAiError = error instanceof AiExtractionError;
      const errorMsg = isAiError
        ? `[${error.failureType}] ${error.message}`
        : (error as Error).message;

      logger.error(
        {
          documentId: doc.id,
          error: errorMsg,
          ...(isAiError && error.requestId ? { requestId: error.requestId } : {}),
        },
        'Failed to process document',
      );

      const now = new Date().toISOString();
      // Store error result
      db.insert(aiProcessingResult)
        .values({
          documentId: doc.id,
          paperlessId: doc.paperlessId,
          provider: provider.provider,
          model: config.model,
          errorMessage: errorMsg,
          appliedStatus: 'pending',
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: aiProcessingResult.documentId,
          set: {
            errorMessage: errorMsg,
            appliedStatus: 'pending',
            createdAt: now,
          },
        })
        .run();

      result.failed++;
    }

    result.processed++;
    await onProgress?.(
      result.processed / totalDocs,
      `Processed ${result.processed} of ${totalDocs} documents (${result.succeeded} succeeded, ${result.failed} failed)`,
    );

    // Rate limiting delay between requests
    if (i < docs.length - 1 && config.rateDelayMs > 0) {
      await sleep(config.rateDelayMs);
    }
  }

  result.durationMs = Math.round(performance.now() - startMs);
  return result;
}
