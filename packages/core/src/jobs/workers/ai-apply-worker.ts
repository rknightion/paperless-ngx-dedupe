import { eq } from 'drizzle-orm';
import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { applyAiResult, type ReferenceData } from '../../ai/apply.js';
import { markAiResultFailed } from '../../ai/queries.js';
import { resolveResultIdsForApplyScope } from '../../ai/scopes.js';
import type { ApplyScope } from '../../ai/scopes.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ai-apply-worker');

interface ApplyTaskData {
  scope: ApplyScope;
  fields: ('title' | 'correspondent' | 'documentType' | 'tags')[];
  allowClearing: boolean;
  createMissingEntities: boolean;
}

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient({ ...paperlessConfig, timeout: 120_000 });

  const aiConfig = getAiConfig(ctx.db);
  const taskData = ctx.taskData as ApplyTaskData;

  const resultIds = resolveResultIdsForApplyScope(ctx.db, taskData.scope);

  if (resultIds.length === 0) {
    await onProgress(1, 'No results to apply');
    return { applied: 0, failed: 0, total: 0, errors: [] };
  }

  // Fetch reference data once for the entire batch
  const [correspondents, documentTypes, tags] = await Promise.all([
    client.getCorrespondents(),
    client.getDocumentTypes(),
    client.getTags(),
  ]);
  const referenceData: ReferenceData = { correspondents, documentTypes, tags };

  // Resolve processed tag ID up front if needed — we'll apply it in bulk after
  let processedTagId: number | null = null;
  if (aiConfig.addProcessedTag && aiConfig.processedTagName) {
    let processedTag = tags.find(
      (t) => t.name.toLowerCase() === aiConfig.processedTagName.toLowerCase(),
    );
    if (!processedTag) {
      processedTag = await client.createTag(aiConfig.processedTagName);
      tags.push(processedTag);
      logger.info({ name: aiConfig.processedTagName }, 'Created ai-processed tag');
    }
    processedTagId = processedTag.id;
  }

  // Pre-load paperlessId mapping for bulk tag application
  const paperlessIdByResultId = new Map<string, number>();
  if (processedTagId !== null) {
    for (const resultId of resultIds) {
      const row = ctx.db
        .select({ paperlessId: aiProcessingResult.paperlessId })
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, resultId))
        .get();
      if (row) paperlessIdByResultId.set(resultId, row.paperlessId);
    }
  }

  let applied = 0;
  let failed = 0;
  const errors: { resultId: string; error: string }[] = [];
  const appliedPaperlessIds: number[] = [];

  const maxConcurrency = aiConfig.applyConcurrency;

  // Rate-limited concurrent pool (same pattern as ai batch processing)
  const pending = new Set<Promise<void>>();

  for (let i = 0; i < resultIds.length; i++) {
    // Wait for a concurrency slot
    if (pending.size >= maxConcurrency) {
      await Promise.race(pending);
    }

    const resultId = resultIds[i];
    const promise = (async () => {
      try {
        await applyAiResult(ctx.db, client, resultId, {
          fields: taskData.fields,
          allowClearing: taskData.allowClearing,
          createMissingEntities: taskData.createMissingEntities,
          // Defer processed tag to bulk_edit call after the pool
          addProcessedTag: false,
          protectedTagsEnabled: aiConfig.protectedTagsEnabled,
          protectedTagNames: aiConfig.protectedTagNames,
          referenceData,
        });
        applied++;

        // Track paperlessId for bulk processed tag
        const paperlessId = paperlessIdByResultId.get(resultId);
        if (paperlessId !== undefined) {
          appliedPaperlessIds.push(paperlessId);
        }
      } catch (error) {
        failed++;
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push({ resultId, error: errMsg });
        try {
          markAiResultFailed(ctx.db, resultId, errMsg);
        } catch {
          // DB update failed — original error already logged
        }
      }

      await onProgress(
        (applied + failed) / resultIds.length,
        `Applying ${applied + failed} of ${resultIds.length} (${applied} succeeded, ${failed} failed)`,
      );
    })();

    pending.add(promise);
    promise.finally(() => pending.delete(promise));
  }

  // Drain remaining in-flight requests
  await Promise.allSettled(pending);

  // Bulk-add the processed tag to all successfully applied documents
  if (processedTagId !== null && appliedPaperlessIds.length > 0) {
    try {
      await client.bulkEdit(appliedPaperlessIds, 'add_tag', { tag: processedTagId });
      logger.info(
        { count: appliedPaperlessIds.length, tagName: aiConfig.processedTagName },
        'Bulk-applied processed tag',
      );
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to bulk-apply processed tag — documents were still updated',
      );
    }
  }

  await onProgress(1, `Apply complete: ${applied} succeeded, ${failed} failed`);
  return { applied, failed, total: resultIds.length, errors };
});
