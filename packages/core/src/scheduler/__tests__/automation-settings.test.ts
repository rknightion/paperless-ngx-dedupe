import { beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import {
  AUTOMATION_DEFAULTS,
  getAutomationSettings,
  updateAutomationSchedule,
} from '../settings.js';

describe('automation settings', () => {
  let sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'];

  beforeEach(async () => {
    ({ sqlite } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(sqlite);
  });

  it('persists safe defaults and round-trips a structured schedule', () => {
    expect(getAutomationSettings(sqlite)).toEqual(AUTOMATION_DEFAULTS);

    const updated = updateAutomationSchedule(
      sqlite,
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'interval', hours: 4 },
        timezone: 'Europe/London',
      },
      new Date('2026-07-24T10:00:00.000Z'),
    );

    expect(updated.schedules.sync).toMatchObject({
      enabled: true,
      cadence: { kind: 'interval', hours: 4 },
      timezone: 'Europe/London',
      nextRunAt: expect.any(String),
    });
    expect(getAutomationSettings(sqlite)).toEqual(updated);
  });

  it.each([
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'cron', cron: '* * * * *' },
        timezone: 'UTC',
      },
    ],
    [{ task: 'sync', enabled: true, cadence: { kind: 'interval', hours: 1 }, timezone: 'UTC' }],
    [{ task: 'sync', enabled: true, cadence: { kind: 'interval', hours: 24 }, timezone: 'UTC' }],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: -1, minute: 0 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 24, minute: 0 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 12, minute: -1 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 12, minute: 60 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'weekly', weekday: -1, hour: 12, minute: 0 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'weekly', weekday: 7, hour: 12, minute: 0 },
        timezone: 'UTC',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'weekly', weekday: 1, hour: 12.5, minute: 0 },
        timezone: 'UTC',
      },
    ],
    [{ task: 'sync', enabled: true, cadence: { kind: 'daily', hour: 1, minute: 0 }, timezone: '' }],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 1, minute: 0 },
        timezone: 'Not/A_Zone',
      },
    ],
    [
      {
        task: 'sync',
        enabled: true,
        cadence: { kind: 'daily', hour: 1, minute: 0 },
        timezone: 'UTC',
        unknown: true,
      },
    ],
    [{ task: 'sync', enabled: true, cadence: { kind: 'manual' }, timezone: 'UTC' }],
  ])('rejects invalid cadence, timezone, and unknown-field boundary %#', (input) => {
    expect(() => updateAutomationSchedule(sqlite, input as never)).toThrow();
  });

  it('keeps scheduled AI opt-in off until positive spend and document caps are present', () => {
    expect(getAutomationSettings(sqlite).schedules.ai_processing.enabled).toBe(false);
    expect(getAutomationSettings(sqlite).ai).toEqual({
      monthlyBudgetUsd: 0,
      maxDocumentsPerRun: 25,
      reviewOnly: true,
    });

    expect(() =>
      updateAutomationSchedule(sqlite, {
        task: 'ai_processing',
        enabled: true,
        cadence: { kind: 'daily', hour: 2, minute: 0 },
        timezone: 'UTC',
        ai: { monthlyBudgetUsd: 0, maxDocumentsPerRun: 25 },
      }),
    ).toThrow();
    expect(() =>
      updateAutomationSchedule(sqlite, {
        task: 'ai_processing',
        enabled: true,
        cadence: { kind: 'daily', hour: 2, minute: 0 },
        timezone: 'UTC',
        ai: { monthlyBudgetUsd: 5, maxDocumentsPerRun: 0 },
      }),
    ).toThrow();

    const enabled = updateAutomationSchedule(sqlite, {
      task: 'ai_processing',
      enabled: true,
      cadence: { kind: 'daily', hour: 2, minute: 0 },
      timezone: 'UTC',
      ai: { monthlyBudgetUsd: 5, maxDocumentsPerRun: 10 },
    });
    expect(enabled.schedules.ai_processing.enabled).toBe(true);
    expect(enabled.ai).toMatchObject({ monthlyBudgetUsd: 5, maxDocumentsPerRun: 10 });
  });
});
