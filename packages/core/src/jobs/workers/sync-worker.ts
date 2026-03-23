import { runWorkerTask } from '../worker-entry.js';
import { syncDocuments } from '../../sync/sync-documents.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getRagConfig } from '../../rag/config.js';
import { createJob } from '../manager.js';
import { launchWorker } from '../worker-launcher.js';
import { getWorkerPath } from '../worker-paths.js';
import { JobType } from '../../types/enums.js';

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient({ ...paperlessConfig, timeout: 120_000 });

  const taskData = ctx.taskData as { force?: boolean; purge?: boolean } | undefined;

  const result = await syncDocuments(
    { db: ctx.db, client },
    {
      forceFullSync: taskData?.force,
      purgeBeforeSync: taskData?.purge,
      onProgress,
    },
  );

  // Auto-index for RAG if enabled
  if (config.RAG_ENABLED && config.AI_OPENAI_API_KEY) {
    try {
      const ragConfig = getRagConfig(ctx.db);
      if (ragConfig.autoIndex) {
        const jobId = createJob(ctx.db, JobType.RAG_INDEXING);
        const workerPath = getWorkerPath('rag-indexing-worker');
        launchWorker({
          jobId,
          dbPath: config.DATABASE_URL,
          workerScriptPath: workerPath,
          taskData: {},
        });
      }
    } catch {
      // Don't fail the sync job if RAG indexing fails to start
    }
  }

  return result;
});
