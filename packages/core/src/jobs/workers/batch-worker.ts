import { runWorkerTask } from '../worker-entry.js';

// Stub for Phase 4 - Batch operations worker
runWorkerTask(async (_ctx, onProgress) => {
  await onProgress(0, 'Batch operations not yet implemented');
  throw new Error('Batch operations worker is not yet implemented (Phase 4)');
});
