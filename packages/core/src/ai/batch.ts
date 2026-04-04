import { eq, inArray, sql } from 'drizzle-orm';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { type AiProviderInterface, AiExtractionError } from './providers/types.js';
import { processDocument } from './extract.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
import {
  aiDocumentsTotal,
  aiTokensTotal,
  aiRunsTotal,
  aiBatchDuration,
  aiDocumentDuration,
} from '../telemetry/metrics.js';
import type { AiBatchResult } from './types.js';
import type { AiConfig } from './types.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { getModelPricing, estimateResultCost } from './costs.js';

const logger = createLogger('ai-batch');

/** RPM limits per provider (requests per minute) */
const PROVIDER_RPM: Record<string, number> = {
  openai: 5_000,
  anthropic: 50,
};

/** Target utilization of rate limits */
const TARGET_UTILIZATION = 0.85;

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

/**
 * Compute the inter-request launch interval in ms from provider rate limits.
 * When rateDelayMs is explicitly set (> 0), uses that as an override.
 * Otherwise auto-calculates from provider RPM limits at 85% utilization.
 */
export function computeRequestInterval(provider: string, rateDelayMs: number): number {
  if (rateDelayMs > 0) return rateDelayMs;
  const rpm = PROVIDER_RPM[provider] ?? PROVIDER_RPM.openai;
  const targetRpm = Math.floor(rpm * TARGET_UTILIZATION);
  return Math.ceil(60_000 / targetRpm);
}

export async function processBatch(
  db: AppDatabase,
  options: BatchProcessOptions,
): Promise<AiBatchResult> {
  return withPyroscopeLabels({ operation: 'ai_batch' }, async () => {
    const { provider, client, config, reprocess = false, documentIds, onProgress } = options;

    const maxConcurrency = config.batchSize;
    const intervalMs = computeRequestInterval(provider.provider, config.rateDelayMs);
    const targetRpm = Math.floor(
      (PROVIDER_RPM[provider.provider] ?? PROVIDER_RPM.openai) * TARGET_UTILIZATION,
    );

    return withSpan(
      'dedupe.ai.batch',
      {
        'gen_ai.system': provider.provider,
        'gen_ai.request.model': config.model,
        'app.ai.reprocess': reprocess,
        'gen_ai.request.batch_size': maxConcurrency,
        'gen_ai.request.target_rpm': targetRpm,
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
        span.setAttribute('app.ai.total_documents', totalDocs);

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
          {
            totalDocuments: totalDocs,
            provider: provider.provider,
            model: config.model,
            maxConcurrency,
            intervalMs,
            targetRpm,
          },
          'Starting AI batch processing',
        );

        await onProgress?.(0, `Starting AI processing of ${totalDocs} documents...`);

        // Pre-partition: handle skipped docs (no content) upfront
        const processableDocs: typeof docs = [];
        for (const doc of docs) {
          if (!doc.fullText) {
            result.skipped++;
            result.processed++;
            aiDocumentsTotal().add(1, { outcome: 'skipped', 'gen_ai.system': provider.provider });
            logger.warn(
              { documentId: doc.id, title: doc.title },
              'Skipping document with no content',
            );
          } else {
            processableDocs.push(doc);
          }
        }

        if (result.skipped > 0) {
          await onProgress?.(
            result.processed / totalDocs,
            `Skipped ${result.skipped} documents with no content`,
          );
        }

        if (processableDocs.length === 0) {
          result.durationMs = Math.round(performance.now() - startMs);
          aiRunsTotal().add(1, { outcome: 'success' });
          aiBatchDuration().record(result.durationMs / 1000);
          return result;
        }

        // Circuit breaker state (safe to mutate — JS is single-threaded)
        const CIRCUIT_BREAKER_THRESHOLD = 3;
        let consecutiveSameError = 0;
        let lastErrorMsg = '';
        let circuitBroken = false;
        let circuitBreakerError: Error | undefined;

        // Process a single document: API call, DB upsert, telemetry
        async function processOne(doc: (typeof processableDocs)[0]): Promise<void> {
          const docStartMs = performance.now();
          try {
            const extraction = await processDocument({
              provider,
              documentTitle: doc.title,
              documentContent: doc.fullText!,
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

            // Normalize suggestions before storing
            const normalizedTitle = normalizeSuggestedLabel(extraction.response.title);
            const normalizedCorrespondent = normalizeSuggestedLabel(
              extraction.response.correspondent,
            );
            const normalizedDocumentType = normalizeSuggestedLabel(
              extraction.response.documentType,
            );
            const normalizedTags = normalizeSuggestedTags(extraction.response.tags);

            // Compute cost estimate
            const pricing = getModelPricing(db, config.model);
            const estimatedCostUsd = pricing
              ? estimateResultCost(
                  pricing,
                  extraction.usage.promptTokens,
                  extraction.usage.completionTokens,
                )
              : null;

            // Upsert result
            db.insert(aiProcessingResult)
              .values({
                documentId: doc.id,
                paperlessId: doc.paperlessId,
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
                evidence: extraction.response.evidence || null,
                rawResponseJson: JSON.stringify(extraction.response),
                promptTokens: extraction.usage.promptTokens,
                completionTokens: extraction.usage.completionTokens,
                estimatedCostUsd,
                processingTimeMs: docDurationMs,
                createdAt: now,
              })
              .onConflictDoUpdate({
                target: aiProcessingResult.documentId,
                set: {
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
                },
              })
              .run();

            result.succeeded++;
            result.totalPromptTokens += extraction.usage.promptTokens;
            result.totalCompletionTokens += extraction.usage.completionTokens;

            // Record per-document metrics
            aiDocumentsTotal().add(1, { outcome: 'succeeded', 'gen_ai.system': provider.provider });
            aiDocumentDuration().record(docDurationMs / 1000, {
              'gen_ai.system': provider.provider,
            });
            aiTokensTotal().add(extraction.usage.promptTokens, {
              'gen_ai.token.type': 'input',
              'gen_ai.system': provider.provider,
            });
            aiTokensTotal().add(extraction.usage.completionTokens, {
              'gen_ai.token.type': 'output',
              'gen_ai.system': provider.provider,
            });
            if (extraction.usage.cachedTokens) {
              aiTokensTotal().add(extraction.usage.cachedTokens, {
                'gen_ai.token.type': 'cached',
                'gen_ai.system': provider.provider,
              });
            }

            // Reset circuit breaker on success
            consecutiveSameError = 0;
            lastErrorMsg = '';
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
            const failureType = isAiError ? error.failureType : null;
            // Store error result
            db.insert(aiProcessingResult)
              .values({
                documentId: doc.id,
                paperlessId: doc.paperlessId,
                provider: provider.provider,
                model: config.model,
                errorMessage: errorMsg,
                failureType,
                appliedStatus: 'failed',
                createdAt: now,
              })
              .onConflictDoUpdate({
                target: aiProcessingResult.documentId,
                set: {
                  errorMessage: errorMsg,
                  failureType,
                  appliedStatus: 'failed',
                  createdAt: now,
                },
              })
              .run();

            result.failed++;
            aiDocumentsTotal().add(1, { outcome: 'failed', 'gen_ai.system': provider.provider });

            // Circuit breaker: track consecutive same errors (skip rate limits — the SDK retries handle those)
            const isRateLimit = isAiError && error.failureType === 'rate_limit';
            if (!isRateLimit) {
              if (errorMsg === lastErrorMsg) {
                consecutiveSameError++;
              } else {
                consecutiveSameError = 1;
                lastErrorMsg = errorMsg;
              }
            }

            if (consecutiveSameError >= CIRCUIT_BREAKER_THRESHOLD) {
              circuitBroken = true;
              circuitBreakerError = new Error(
                `Processing stopped: ${CIRCUIT_BREAKER_THRESHOLD} consecutive documents failed with the same error: ${errorMsg}`,
                { cause: error },
              );

              logger.error(
                { consecutiveFailures: CIRCUIT_BREAKER_THRESHOLD, error: errorMsg },
                'Circuit breaker triggered — stopping batch',
              );
            }
          }

          result.processed++;
          await onProgress?.(
            result.processed / totalDocs,
            `Processed ${result.processed} of ${totalDocs} documents (${result.succeeded} succeeded, ${result.failed} failed)`,
          );
        }

        // Rate-limited concurrent pool
        const pending = new Set<Promise<void>>();

        for (let i = 0; i < processableDocs.length; i++) {
          if (circuitBroken) break;

          // Wait for a concurrency slot
          if (pending.size >= maxConcurrency) {
            await Promise.race(pending);
          }

          // Check again after awaiting — circuit breaker may have tripped
          if (circuitBroken) break;

          const doc = processableDocs[i];
          const promise = processOne(doc);
          pending.add(promise);
          promise.finally(() => pending.delete(promise));

          // Rate-limit: pause before launching the next request
          if (i < processableDocs.length - 1 && intervalMs > 0) {
            await sleep(intervalMs);
          }
        }

        // Drain remaining in-flight requests
        await Promise.allSettled(pending);

        result.durationMs = Math.round(performance.now() - startMs);

        // Record batch-level metrics
        const batchOutcome = result.failed > 0 && result.succeeded === 0 ? 'failure' : 'success';
        aiRunsTotal().add(1, { outcome: batchOutcome });
        aiBatchDuration().record(result.durationMs / 1000);

        span.setAttributes({
          'app.batch.succeeded': result.succeeded,
          'app.batch.failed': result.failed,
          'app.batch.skipped': result.skipped,
          'app.batch.circuit_breaker': circuitBroken,
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

        if (circuitBreakerError) {
          throw circuitBreakerError;
        }

        return result;
      },
    );
  });
}
