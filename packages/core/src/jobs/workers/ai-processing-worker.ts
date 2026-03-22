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

  const apiKey =
    aiConfig.provider === 'openai' ? config.AI_OPENAI_API_KEY : config.AI_ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${aiConfig.provider}`);
  }

  const provider = await createAiProvider(
    aiConfig.provider,
    apiKey,
    aiConfig.model,
    aiConfig.maxRetries,
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
