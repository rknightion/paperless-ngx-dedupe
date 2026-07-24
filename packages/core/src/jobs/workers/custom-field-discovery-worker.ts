import { runCustomFieldDiscoveryOperation } from '../../ai/custom-field-discovery-operation.js';
import { assertOperationLeaseOwnership } from '../../scheduler/coordinator.js';
import { runWorkerTask } from '../worker-entry.js';

runWorkerTask(async (ctx, onProgress) => {
  assertOperationLeaseOwnership(ctx.sqlite, 'custom_field_discovery', ctx.jobId);
  return runCustomFieldDiscoveryOperation({
    sqlite: ctx.sqlite,
    db: ctx.db,
    jobId: ctx.jobId,
    taskData: ctx.taskData,
    onProgress,
  });
});
