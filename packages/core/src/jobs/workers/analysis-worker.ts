import { runWorkerTask } from '../worker-entry.js';
import { runAnalysis } from '../../dedup/analyze.js';

runWorkerTask(async (ctx, onProgress) => {
  const taskData = ctx.taskData as { force?: boolean } | undefined;
  const result = await runAnalysis(ctx.db, { force: taskData?.force, onProgress });
  return result;
});
