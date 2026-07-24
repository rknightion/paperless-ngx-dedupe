import { parentPort, workerData } from 'node:worker_threads';

import { createDatabaseWithHandle } from '../../../db/client.js';
import { claimAiMutationPlan } from '../../preflight.js';
import { MutationPlanError } from '../../../review/mutation-plans.js';

const { databasePath, token, jobId, barrier } = workerData as {
  databasePath: string;
  token: string;
  jobId: string;
  barrier: SharedArrayBuffer;
};

const handle = createDatabaseWithHandle(databasePath);
const view = new Int32Array(barrier);
parentPort?.postMessage({ type: 'ready' });
Atomics.wait(view, 0, 0);

try {
  claimAiMutationPlan(handle.db, token, 'ai_apply', jobId, new Date('2026-07-24T10:01:00.000Z'));
  parentPort?.postMessage({ type: 'result', status: 'claimed' });
} catch (error) {
  parentPort?.postMessage({
    type: 'result',
    status: 'rejected',
    reason: error instanceof MutationPlanError ? error.reason : 'unexpected',
  });
} finally {
  handle.sqlite.close();
}
