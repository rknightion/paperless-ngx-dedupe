import { parentPort, workerData } from 'node:worker_threads';

import { createDatabaseWithHandle } from '../../../db/client.js';
import { reserveAiBudget } from '../../budget.js';

const data = workerData as {
  path: string;
  barrier: SharedArrayBuffer;
  input: Omit<Parameters<typeof reserveAiBudget>[1], 'now'> & { now: string };
};
const state = new Int32Array(data.barrier);
const sqlite = createDatabaseWithHandle(data.path).sqlite;

Atomics.add(state, 0, 1);
Atomics.notify(state, 0);
while (Atomics.load(state, 0) < 2) {
  Atomics.wait(state, 0, 1, 5_000);
}

const startedAt = performance.now();
try {
  reserveAiBudget(sqlite, { ...data.input, now: new Date(data.input.now) });
  parentPort?.postMessage({ status: 'fulfilled', startedAt, endedAt: performance.now() });
} catch {
  parentPort?.postMessage({ status: 'rejected', startedAt, endedAt: performance.now() });
} finally {
  sqlite.close();
}
