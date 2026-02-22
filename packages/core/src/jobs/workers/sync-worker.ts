import { runWorkerTask } from '../worker-entry.js';
import { syncDocuments } from '../../sync/sync-documents.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';

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

  return result;
});
