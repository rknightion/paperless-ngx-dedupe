import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { claimAiMutationPlan, executeClaimedAiApplyPlan } from '../../ai/preflight.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';

interface ApplyTaskData {
  planToken: string;
}

runWorkerTask(async (ctx, onProgress) => {
  const taskData = ctx.taskData as ApplyTaskData;
  assertOperationLeaseOwnership(ctx.sqlite, 'ai_apply', ctx.jobId);
  if (
    !taskData ||
    typeof taskData.planToken !== 'string' ||
    taskData.planToken.length < 16 ||
    Object.keys(taskData).some((key) => key !== 'planToken')
  ) {
    throw new Error('AI apply worker requires only an opaque reviewed plan token');
  }
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const client = new PaperlessClient({
    ...toPaperlessConfig(config),
    timeout: 120_000,
  });
  const aiConfig = getAiConfig(ctx.db);
  const plan = claimAiMutationPlan(ctx.db, taskData.planToken, 'ai_apply', ctx.jobId);
  await onProgress(0, `Applying 0 of ${plan.resultIds.length}`);
  const result = await executeClaimedAiApplyPlan(ctx.db, client, plan, ctx.jobId, {
    processedTagName: aiConfig.processedTagName,
  });
  await onProgress(
    1,
    `Apply complete: ${result.applied} applied, ${result.conflicts} conflicts, ${result.failed} failed`,
  );
  return result;
});
