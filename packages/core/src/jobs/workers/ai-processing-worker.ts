import { eq } from 'drizzle-orm';
import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { createAiProvider } from '../../ai/providers/factory.js';
import { processBatch } from '../../ai/batch.js';
import { evaluateAndAutoApply } from '../../ai/auto-apply.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient({ ...paperlessConfig, timeout: 120_000 });

  const aiConfig = getAiConfig(ctx.db);
  const taskData = ctx.taskData as
    | {
        reprocess?: boolean;
        documentIds?: string[];
      }
    | undefined;

  const apiKey = config.AI_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('No OpenAI API key configured (AI_OPENAI_API_KEY)');
  }

  // Cap SDK retries to 2 for batch processing — the batch-level retry queue
  // handles rate limit recovery globally, so we want fast 429 detection
  const batchMaxRetries = Math.min(aiConfig.maxRetries, 2);

  const provider = await createAiProvider(
    apiKey,
    aiConfig.model,
    batchMaxRetries,
    aiConfig.flexProcessing,
  );

  const result = await processBatch(ctx.db, {
    provider,
    client,
    config: aiConfig,
    reprocess: taskData?.reprocess,
    documentIds: taskData?.documentIds,
    onProgress,
  });

  // Auto-apply eligible results if enabled
  if (aiConfig.autoApplyEnabled && result.succeeded > 0) {
    // Query for pending_review results that were just processed
    const pendingResults = ctx.db
      .select({ id: aiProcessingResult.id })
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.appliedStatus, 'pending_review'))
      .all();

    if (pendingResults.length > 0) {
      const pendingIds = pendingResults.map((r) => r.id);

      const autoApplyResult = await evaluateAndAutoApply(
        ctx.db,
        client,
        pendingIds,
        aiConfig,
        async (progress, message) => {
          // Map auto-apply progress to 90-100% range (batch used 0-90%)
          await onProgress(0.9 + progress * 0.1, `Auto-apply: ${message}`);
        },
      );

      result.autoApplied = autoApplyResult.autoApplied;
      result.autoApplySkipped = autoApplyResult.skippedByGates;
    }
  }

  return result;
});
