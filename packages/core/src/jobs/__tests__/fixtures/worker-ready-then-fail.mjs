import Database from 'better-sqlite3';
import { parentPort, workerData } from 'node:worker_threads';

const claimed = workerData.taskData?.claimed ?? true;
if (claimed) {
  const sqlite = new Database(workerData.dbPath);
  sqlite
    .prepare(
      `UPDATE job
       SET status = 'running', started_at = ?, execution_token = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .run(new Date().toISOString(), workerData.executionToken, workerData.jobId);
  sqlite.close();
}

parentPort.postMessage({
  type: 'worker-ready',
  jobId: workerData.jobId,
  executionToken: workerData.executionToken,
  claimed,
});

setImmediate(() => {
  throw new Error('post-ready worker failure');
});
