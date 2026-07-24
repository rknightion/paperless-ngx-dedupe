import Database from 'better-sqlite3';
import { workerData } from 'node:worker_threads';

const sqlite = new Database(workerData.dbPath);
sqlite
  .prepare(
    `UPDATE job
     SET status = 'running', started_at = ?, execution_token = ?
     WHERE id = ? AND status = 'pending'`,
  )
  .run(new Date().toISOString(), workerData.executionToken, workerData.jobId);
sqlite.close();

throw new Error('claimed before readiness then crashed');
