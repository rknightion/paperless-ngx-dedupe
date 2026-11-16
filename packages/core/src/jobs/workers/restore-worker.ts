import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { restoreDeletionRun } from '../../review/restore.js';

runWorkerTask(async (ctx, onProgress) => {
  const taskData = ctx.taskData as { planId?: unknown } | undefined;
  if (!taskData || typeof taskData.planId !== 'string' || taskData.planId.length === 0) {
    throw new Error('Restore worker requires a completed deletion plan');
  }
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const client = new PaperlessClient({ ...toPaperlessConfig(config), timeout: 120_000 });
  const result = await restoreDeletionRun({ db: ctx.db, client }, taskData.planId, {
    leaseOwnerId: ctx.jobId,
    onProgress,
  });
  await onProgress(
    1,
    result.restored === 0
      ? `Nothing to restore: ${result.notRestorable} no longer in the recycle bin`
      : `Restored ${result.restored}; ${result.notRestorable} no longer in the recycle bin`,
  );
  return result;
});
