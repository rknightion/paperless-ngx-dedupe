import { runWorkerTask } from '../worker-entry.js';
import { runAnalysis } from '../../dedup/analyze.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';
import { count, eq, sql } from 'drizzle-orm';
import { parseConfig } from '../../config.js';
import { getJob } from '../manager.js';
import { getNotificationSettings } from '../../notifications/settings.js';
import { sendNotification } from '../../notifications/send.js';
import { duplicateGroup } from '../../schema/sqlite/duplicates.js';
import { DUPLICATE_HIGH_CONFIDENCE_THRESHOLD } from '../../queries/types.js';

runWorkerTask(async (ctx, onProgress) => {
  assertOperationLeaseOwnership(ctx.sqlite, 'analysis', ctx.jobId);
  const taskData = ctx.taskData as { force?: boolean } | undefined;
  const result = await runAnalysis(ctx.db, { force: taskData?.force, onProgress });
  if (process.env.NOTIFY_URL) {
    ctx.afterCompletion?.(async () => {
      const preferences = getNotificationSettings(ctx.db);
      const completed = getJob(ctx.db, ctx.jobId);
      if (
        !preferences.onNewDuplicates ||
        result.groupsCreated < preferences.minNewGroups ||
        (preferences.scheduledRunsOnly &&
          completed?.triggerKind !== 'schedule' &&
          completed?.triggerKind !== 'dependency')
      )
        return;
      const counts = ctx.db
        .select({
          pendingGroups: count(),
          highConfidencePending: sql<number>`COALESCE(SUM(CASE WHEN ${duplicateGroup.confidenceScore} >= ${DUPLICATE_HIGH_CONFIDENCE_THRESHOLD} THEN 1 ELSE 0 END), 0)`,
        })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.status, 'pending'))
        .get()!;
      await sendNotification(parseConfig(process.env), {
        event: 'duplicates.new',
        occurredAt: new Date().toISOString(),
        data: { jobId: ctx.jobId, jobType: 'analysis', newGroups: result.groupsCreated, ...counts },
      });
    });
  }
  return result;
});
