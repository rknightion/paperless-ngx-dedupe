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

  test('automation API persists safe defaults and strict structured schedules', async ({
    request,
  }) => {
    const defaults = await request.get('/api/v1/automation');
    expect(defaults.status()).toBe(200);
    expect((await defaults.json()).data).toMatchObject({
      schedules: {
        sync: { enabled: false, cadence: { kind: 'manual' }, nextRunAt: null },
        analysis: { enabled: false, cadence: { kind: 'manual' } },
        ai_processing: { enabled: false, cadence: { kind: 'manual' } },
      },
      ai: { monthlyBudgetUsd: 0, maxDocumentsPerRun: 25, reviewOnly: true },
    });

    const updated = await request.put('/api/v1/automation', {
      data: {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'interval', hours: 4 },
        timezone: 'Europe/London',
      },
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).data.schedules.sync).toMatchObject({
      enabled: true,
      cadence: { kind: 'interval', hours: 4 },
      timezone: 'Europe/London',
      nextRunAt: expect.any(String),
    });

    for (const invalid of [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'cron', cron: '* * * * *' },
        timezone: 'UTC',
      },
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 24, minute: 0 },
        timezone: 'UTC',
      },
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 2, minute: 0 },
        timezone: 'Not/A_Zone',
      },
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 2, minute: 0 },
        timezone: 'UTC',
        rawCron: '* * * * *',
      },
    ]) {
      const response = await request.put('/api/v1/automation', { data: invalid });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toMatchObject({
        code: 'VALIDATION_FAILED',
        operation: 'update_automation_schedule',
        validationIssues: expect.any(Array),
      });
    }
  });

  test('manual run uses the coordinator without mutating schedule configuration', async ({
    request,
  }) => {
    const before = (await (await request.get('/api/v1/automation')).json()).data;
    const run = await request.post('/api/v1/automation/run', { data: { task: 'sync' } });
    expect(run.status()).toBe(202);
    expect((await run.json()).data).toMatchObject({ jobId: expect.any(String) });
    const after = (await (await request.get('/api/v1/automation')).json()).data;
    expect(after).toEqual(before);
  });

  test('AI scheduling is opt-in, review-only, and requires positive spend and document caps', async ({
    request,
  }) => {
    const zeroBudget = await request.put('/api/v1/automation', {
      data: {
        task: 'ai_processing',
        enabled: true,
        cadence: { kind: 'daily', hour: 3, minute: 0 },
        timezone: 'UTC',
        ai: { monthlyBudgetUsd: 0, maxDocumentsPerRun: 25 },
      },
    });
    expect(zeroBudget.status()).toBe(400);

    const enabled = await request.put('/api/v1/automation', {
      data: {
        task: 'ai_processing',
        enabled: true,
        cadence: { kind: 'daily', hour: 3, minute: 0 },
        timezone: 'UTC',
        ai: { monthlyBudgetUsd: 12.5, maxDocumentsPerRun: 25 },
      },
    });
    expect(enabled.status()).toBe(200);
    expect((await enabled.json()).data).toMatchObject({
      schedules: { ai_processing: { enabled: true } },
      ai: { monthlyBudgetUsd: 12.5, maxDocumentsPerRun: 25, reviewOnly: true },
    });
  });

  test('operation conflicts are typed and do not expose unsafe details', async ({ request }) => {
    const sentinel = 'SECRET-OCR-PROMPT-REMOTE-BODY';
    withDatabase((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO operation_lease (
            id, operation, owner_id, acquired_at, heartbeat_at, expires_at
          ) VALUES (?, 'analysis', ?, ?, ?, NULL)`,
        )
        .run(nanoid(), sentinel, new Date().toISOString(), new Date().toISOString());
    });
    const response = await request.post('/api/v1/automation/run', { data: { task: 'sync' } });
    expect(response.status()).toBe(409);
    const body = await response.text();
    expect(JSON.parse(body).error).toMatchObject({
      code: 'JOB_ALREADY_RUNNING',
      operation: 'manual_automation_run',
      retryable: false,
    });
    expect(body).not.toContain(sentinel);
  });

  test('settings exposes three accessible schedule cards and cockpit next-run state', async ({
    page,
  }) => {
    await page.goto('/settings');
    const region = page.getByRole('region', { name: 'Automation schedules' });
    await expect(region).toBeVisible();
    await expect(region.getByRole('group')).toHaveCount(3);
    await expect(region.getByText('AI suggestions are review-only')).toBeVisible();
    await expect(region.getByLabel('Sync timezone')).toBeVisible();
    await expect(region.getByLabel('Analysis cadence')).toBeVisible();
    await expect(region.getByLabel('AI monthly budget (USD)')).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Automation next runs' })).toBeVisible();
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
