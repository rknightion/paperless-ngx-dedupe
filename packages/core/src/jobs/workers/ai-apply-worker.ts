import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { applyAiResult } from '../../ai/apply.js';
import { markAiResultFailed } from '../../ai/queries.js';
import { resolveResultIdsForApplyScope } from '../../ai/scopes.js';
import type { ApplyScope } from '../../ai/scopes.js';

interface ApplyTaskData {
  scope: ApplyScope;
  fields: ('correspondent' | 'documentType' | 'tags')[];
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

  let applied = 0;
  let failed = 0;
  const errors: { resultId: string; error: string }[] = [];

  for (let i = 0; i < resultIds.length; i++) {
    await onProgress(
      i / resultIds.length,
      `Applying ${i + 1} of ${resultIds.length} (${applied} succeeded, ${failed} failed)`,
    );

    try {
      await applyAiResult(ctx.db, client, resultIds[i], {
        fields: taskData.fields,
        allowClearing: taskData.allowClearing,
        createMissingEntities: taskData.createMissingEntities,
        addProcessedTag: aiConfig.addProcessedTag,
        processedTagName: aiConfig.processedTagName,
        protectedTagsEnabled: aiConfig.protectedTagsEnabled,
        protectedTagNames: aiConfig.protectedTagNames,
      });
      applied++;
    } catch (error) {
      failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push({ resultId: resultIds[i], error: errMsg });
      // Mark as failed in DB if not already marked by applyAiResult
      try {
        markAiResultFailed(ctx.db, resultIds[i], errMsg);
      } catch {
        // DB update failed — original error already logged
      }
    }
  }

  await onProgress(1, `Apply complete: ${applied} succeeded, ${failed} failed`);
  return { applied, failed, total: resultIds.length, errors };
});
