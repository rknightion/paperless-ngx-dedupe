import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { claimAiMutationPlan } from '../../ai/preflight.js';
import { executeClaimedAiRevertPlan } from '../../ai/revert.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';

interface RevertTaskData {
  planToken: string;
}

runWorkerTask(async (ctx, onProgress) => {
  const taskData = ctx.taskData as RevertTaskData;
  assertOperationLeaseOwnership(ctx.sqlite, 'ai_revert', ctx.jobId);
  if (
    !taskData ||
    typeof taskData.planToken !== 'string' ||
    taskData.planToken.length < 16 ||
    Object.keys(taskData).some((key) => key !== 'planToken')
  ) {
    throw new Error('AI revert worker requires only an opaque reviewed plan token');
  }
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const client = new PaperlessClient({
    ...toPaperlessConfig(config),
    timeout: 120_000,
  });
  const plan = claimAiMutationPlan(ctx.db, taskData.planToken, 'ai_revert', ctx.jobId);
  await onProgress(0, `Reverting 0 of ${plan.resultIds.length}`);
  const result = await executeClaimedAiRevertPlan(ctx.db, client, plan, ctx.jobId);
  await onProgress(
    1,
    `Revert complete: ${result.applied} reverted, ${result.conflicts} conflicts, ${result.failed} failed`,
  );
  return result;
});
