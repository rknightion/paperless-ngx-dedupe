import { eq, inArray, sql } from 'drizzle-orm';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { type AiProviderInterface, AiExtractionError } from './providers/types.js';
import { processDocument } from './extract.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import {
  aiDocumentsTotal,
  aiTokensTotal,
  aiRunsTotal,
  aiBatchDuration,
  aiDocumentDuration,
} from '../telemetry/metrics.js';
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
  const { provider, client, config, reprocess = false, documentIds, onProgress } = options;

  return withSpan(
    'dedupe.ai.batch',
    {
      'ai.provider': provider.provider,
      'ai.model': config.model,
      'ai.reprocess': reprocess,
    },
    async (span) => {
      const startMs = performance.now();

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
      span.setAttribute('ai.total_documents', totalDocs);

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
        aiRunsTotal().add(1, { outcome: 'success' });
        aiBatchDuration().record(result.durationMs / 1000);
        return result;
      }

      logger.info(
        { totalDocuments: totalDocs, provider: provider.provider, model: config.model },
        'Starting AI batch processing',
      );

      await onProgress?.(0, `Starting AI processing of ${totalDocs} documents...`);

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];

        if (!doc.fullText) {
          result.skipped++;
          result.processed++;
          aiDocumentsTotal().add(1, { outcome: 'skipped', provider: provider.provider });
          logger.warn(
            { documentId: doc.id, title: doc.title },
            'Skipping document with no content',
          );
          await onProgress?.(result.processed / totalDocs, `Skipped ${doc.title} (no content)`);
          continue;
        }

        const docStartMs = performance.now();
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
          const docDurationMs = Math.round(performance.now() - docStartMs);

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
              processingTimeMs: docDurationMs,
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
                processingTimeMs: docDurationMs,
                createdAt: now,
              },
            })
            .run();

          result.succeeded++;
          result.totalPromptTokens += extraction.usage.promptTokens;
          result.totalCompletionTokens += extraction.usage.completionTokens;

          // Record per-document metrics
          aiDocumentsTotal().add(1, { outcome: 'succeeded', provider: provider.provider });
          aiDocumentDuration().record(docDurationMs / 1000, { provider: provider.provider });
          aiTokensTotal().add(extraction.usage.promptTokens, {
            type: 'prompt',
            provider: provider.provider,
          });
          aiTokensTotal().add(extraction.usage.completionTokens, {
            type: 'completion',
            provider: provider.provider,
          });
          if (extraction.usage.cachedTokens) {
            aiTokensTotal().add(extraction.usage.cachedTokens, {
              type: 'cached',
              provider: provider.provider,
            });
          }
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
          aiDocumentsTotal().add(1, { outcome: 'failed', provider: provider.provider });
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

      // Record batch-level metrics
      const batchOutcome = result.failed > 0 && result.succeeded === 0 ? 'failure' : 'success';
      aiRunsTotal().add(1, { outcome: batchOutcome });
      aiBatchDuration().record(result.durationMs / 1000);

      span.setAttributes({
        'batch.succeeded': result.succeeded,
        'batch.failed': result.failed,
        'batch.skipped': result.skipped,
      });

      logger.info(
        {
          totalDocuments: totalDocs,
          succeeded: result.succeeded,
          failed: result.failed,
          skipped: result.skipped,
          durationMs: result.durationMs,
          totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
        },
        'AI batch processing complete',
      );

      return result;
    },
  );
}
