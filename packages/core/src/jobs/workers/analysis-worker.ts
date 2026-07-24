import { runWorkerTask } from '../worker-entry.js';
import { runAnalysis } from '../../dedup/analyze.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';

runWorkerTask(async (ctx, onProgress) => {
  assertOperationLeaseOwnership(ctx.sqlite, 'analysis', ctx.jobId);
  const taskData = ctx.taskData as { force?: boolean } | undefined;
  const result = await runAnalysis(ctx.db, { force: taskData?.force, onProgress });
  return result;
});
