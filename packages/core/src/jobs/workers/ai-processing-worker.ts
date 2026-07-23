import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { createAiProvider } from '../../ai/providers/factory.js';
import { processBatch } from '../../ai/batch.js';

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

  return result;
});
