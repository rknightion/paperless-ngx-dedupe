import { runWorkerTask } from '../worker-entry.js';
import { syncDocuments, syncDocumentsById } from '../../sync/sync-documents.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';

runWorkerTask(async (ctx, onProgress) => {
  assertOperationLeaseOwnership(ctx.sqlite, 'sync', ctx.jobId);
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient({ ...paperlessConfig, timeout: 120_000 });

  const taskData = ctx.taskData as
    { force?: boolean; purge?: boolean; paperlessIds?: number[] } | undefined;
  const syncGenerationId = (
    ctx.sqlite
      .prepare('SELECT id FROM sync_change_generation WHERE sync_job_id = ?')
      .get(ctx.jobId) as { id: string } | undefined
  )?.id;
  if (taskData?.paperlessIds && !taskData.force && !taskData.purge) {
    const startedAt = performance.now();
    const result = await syncDocumentsById({ db: ctx.db, client }, taskData.paperlessIds, {
      syncJobId: ctx.jobId,
      syncGenerationId,
      onProgress,
    });
    return {
      ...result,
      totalFetched: result.inserted + result.updated,
      skipped: result.notFound.length,
      failed: 0,
      reconciled: 0,
      errors: [],
      durationMs: Math.round(performance.now() - startedAt),
      syncType: 'incremental',
    };
  }

  const result = await syncDocuments(
    { db: ctx.db, client },
    {
      forceFullSync: taskData?.force,
      purgeBeforeSync: taskData?.purge,
      syncJobId: ctx.jobId,
      syncGenerationId,
      onProgress,
    },
  );

  return result;
});
