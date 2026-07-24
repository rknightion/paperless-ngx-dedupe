import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

import { expect, test, DB_PATH } from './fixtures/test-app';

type IntentRow = {
  jobId: string;
  status: string;
  triggerKind: string;
  taskDataJson: string | null;
};

type JobRow = {
  status: string;
};

test.describe('Safe automation dispatch', () => {
  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('manual and scheduled work share durable dispatch with distinct triggers', async ({
    request,
  }) => {
    const manualResponse = await request.post('/api/v1/sync', {
      data: { force: true, purge: true },
    });
    expect(manualResponse.status()).toBe(202);
    const manualJobId = (await manualResponse.json()).data.jobId as string;

    await expect
      .poll(() => readIntent(manualJobId), { timeout: 15_000 })
      .toMatchObject({
        jobId: manualJobId,
        status: 'dispatched',
        triggerKind: 'manual',
        taskDataJson: JSON.stringify({ force: true, purge: true }),
      });
    await expect.poll(() => readJob(manualJobId)?.status, { timeout: 15_000 }).toBe('completed');

    const scheduleId = nanoid();
    const now = new Date();
    const dueAt = new Date(now.getTime() - 1_000).toISOString();
    withDatabase((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO automation_schedule (
            id, task, enabled, cadence_json, timezone, next_due_at,
            last_claimed_due_at, created_at, updated_at
          ) VALUES (?, 'sync', 1, ?, 'Europe/London', ?, NULL, ?, ?)`,
        )
        .run(
          scheduleId,
          JSON.stringify({ kind: 'daily', hour: 3, minute: 0 }),
          dueAt,
          now.toISOString(),
          now.toISOString(),
        );
    });

    let scheduledIntent: IntentRow | undefined;
    await expect
      .poll(
        () => {
          scheduledIntent = readScheduledIntent(scheduleId);
          return scheduledIntent;
        },
        { timeout: 15_000 },
      )
      .toMatchObject({
        status: 'dispatched',
        triggerKind: 'schedule',
        taskDataJson: null,
      });
    await expect
      .poll(() => readJob(scheduledIntent!.jobId)?.status, { timeout: 15_000 })
      .toBe('completed');
  });
});

function readIntent(jobId: string): IntentRow | undefined {
  return withDatabase((sqlite) =>
    sqlite
      .prepare(
        `SELECT
          job_id AS jobId, status, trigger_kind AS triggerKind,
          task_data_json AS taskDataJson
         FROM dispatch_intent
         WHERE job_id = ?`,
      )
      .get(jobId),
  ) as IntentRow | undefined;
}

function readScheduledIntent(scheduleId: string): IntentRow | undefined {
  return withDatabase((sqlite) =>
    sqlite
      .prepare(
        `SELECT
          job_id AS jobId, status, trigger_kind AS triggerKind,
          task_data_json AS taskDataJson
         FROM dispatch_intent
         WHERE schedule_id = ?`,
      )
      .get(scheduleId),
  ) as IntentRow | undefined;
}

function readJob(jobId: string): JobRow | undefined {
  return withDatabase((sqlite) =>
    sqlite.prepare('SELECT status FROM job WHERE id = ?').get(jobId),
  ) as JobRow | undefined;
}

function withDatabase<T>(read: (sqlite: Database.Database) => T): T {
  const sqlite = new Database(DB_PATH);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}
