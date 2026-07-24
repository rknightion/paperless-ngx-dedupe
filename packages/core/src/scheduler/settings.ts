import type Database from 'better-sqlite3';
import { z } from 'zod';

import { nextOccurrence } from './occurrences.js';
import type { ScheduleCadence, ScheduleTask } from './types.js';

const TASKS = ['sync', 'analysis', 'ai_processing'] as const;
const AUTOMATION_AI_BUDGET_KEY = 'automation.aiMonthlyBudgetUsd';
const AUTOMATION_AI_CAP_KEY = 'automation.aiMaxDocumentsPerRun';

const manualCadenceSchema = z.object({ kind: z.literal('manual') }).strict();
const intervalCadenceSchema = z
  .object({
    kind: z.literal('interval'),
    hours: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(12)]),
  })
  .strict();
const dailyCadenceSchema = z
  .object({
    kind: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();
const weeklyCadenceSchema = z
  .object({
    kind: z.literal('weekly'),
    weekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export const scheduleCadenceSchema = z.discriminatedUnion('kind', [
  manualCadenceSchema,
  intervalCadenceSchema,
  dailyCadenceSchema,
  weeklyCadenceSchema,
]);

function isIanaTimezone(value: string): boolean {
  if (value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const automationScheduleUpdateSchema = z
  .object({
    task: z.enum(TASKS),
    enabled: z.boolean(),
    cadence: scheduleCadenceSchema,
    timezone: z.string().refine(isIanaTimezone, 'Invalid IANA timezone'),
    ai: z
      .object({
        monthlyBudgetUsd: z.number().finite().min(0).max(1_000_000),
        maxDocumentsPerRun: z.number().int().min(1).max(10_000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled && value.cadence.kind === 'manual') {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'An enabled schedule requires an interval, daily, or weekly cadence',
      });
    }
    if (value.task !== 'ai_processing' && value.ai !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ai'],
        message: 'AI budget settings are only valid for AI processing',
      });
    }
  });

export type AutomationScheduleUpdate = z.infer<typeof automationScheduleUpdateSchema>;

export interface AutomationScheduleView {
  task: ScheduleTask;
  enabled: boolean;
  cadence: ScheduleCadence;
  timezone: string;
  nextRunAt: string | null;
}

export interface AutomationSettings {
  schedules: Record<ScheduleTask, AutomationScheduleView>;
  ai: {
    monthlyBudgetUsd: number;
    maxDocumentsPerRun: number;
    reviewOnly: true;
  };
}

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  schedules: {
    sync: {
      task: 'sync',
      enabled: false,
      cadence: { kind: 'manual' },
      timezone: 'UTC',
      nextRunAt: null,
    },
    analysis: {
      task: 'analysis',
      enabled: false,
      cadence: { kind: 'manual' },
      timezone: 'UTC',
      nextRunAt: null,
    },
    ai_processing: {
      task: 'ai_processing',
      enabled: false,
      cadence: { kind: 'manual' },
      timezone: 'UTC',
      nextRunAt: null,
    },
  },
  ai: { monthlyBudgetUsd: 0, maxDocumentsPerRun: 25, reviewOnly: true },
};

function configNumber(sqlite: Database.Database, key: string, fallback: number): number {
  const row = sqlite.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
    { value: string } | undefined;
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ensureAutomationDefaults(sqlite: Database.Database, now = new Date()): void {
  const nowIso = now.toISOString();
  const insertSchedule = sqlite.prepare(
    `INSERT INTO automation_schedule (
      id, task, enabled, cadence_json, timezone, next_due_at,
      last_claimed_due_at, created_at, updated_at
    ) VALUES (?, ?, 0, ?, 'UTC', NULL, NULL, ?, ?)
    ON CONFLICT(task) DO NOTHING`,
  );
  const insertConfig = sqlite.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO NOTHING`,
  );
  sqlite.transaction(() => {
    for (const task of TASKS) {
      insertSchedule.run(
        `automation-${task}`,
        task,
        JSON.stringify({ kind: 'manual' }),
        nowIso,
        nowIso,
      );
    }
    insertConfig.run(AUTOMATION_AI_BUDGET_KEY, '0', nowIso);
    insertConfig.run(AUTOMATION_AI_CAP_KEY, '25', nowIso);
  })();
}

export function getAutomationSettings(sqlite: Database.Database): AutomationSettings {
  ensureAutomationDefaults(sqlite);
  const rows = sqlite
    .prepare(
      `SELECT task, enabled, cadence_json AS cadenceJson, timezone,
              next_due_at AS nextRunAt
       FROM automation_schedule WHERE task IN ('sync', 'analysis', 'ai_processing')`,
    )
    .all() as {
    task: ScheduleTask;
    enabled: number;
    cadenceJson: string;
    timezone: string;
    nextRunAt: string | null;
  }[];
  const schedules = structuredClone(AUTOMATION_DEFAULTS.schedules);
  for (const row of rows) {
    schedules[row.task] = {
      task: row.task,
      enabled: Boolean(row.enabled),
      cadence: scheduleCadenceSchema.parse(JSON.parse(row.cadenceJson)) as ScheduleCadence,
      timezone: row.timezone,
      nextRunAt: row.nextRunAt,
    };
  }
  return {
    schedules,
    ai: {
      monthlyBudgetUsd: configNumber(sqlite, AUTOMATION_AI_BUDGET_KEY, 0),
      maxDocumentsPerRun: configNumber(sqlite, AUTOMATION_AI_CAP_KEY, 25),
      reviewOnly: true,
    },
  };
}

export function updateAutomationSchedule(
  sqlite: Database.Database,
  input: unknown,
  now = new Date(),
): AutomationSettings {
  const parsed = automationScheduleUpdateSchema.parse(input);
  const current = getAutomationSettings(sqlite);
  const ai = parsed.ai ?? current.ai;
  if (parsed.task === 'ai_processing' && parsed.enabled) {
    if (ai.monthlyBudgetUsd <= 0) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['ai', 'monthlyBudgetUsd'],
          message: 'Scheduled AI requires a positive monthly budget',
          input,
        },
      ]);
    }
    if (ai.maxDocumentsPerRun < 1) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['ai', 'maxDocumentsPerRun'],
          message: 'Scheduled AI requires a document cap',
          input,
        },
      ]);
    }
  }

  const nowIso = now.toISOString();
  const schedule = {
    id: `automation-${parsed.task}`,
    task: parsed.task,
    enabled: parsed.enabled,
    cadence: parsed.cadence as ScheduleCadence,
    timezone: parsed.timezone,
    nextDueAt: null,
    lastClaimedDueAt: null,
  };
  const nextRunAt =
    parsed.enabled && parsed.cadence.kind !== 'manual'
      ? (nextOccurrence(schedule, now)?.toISOString() ?? null)
      : null;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET enabled = ?, cadence_json = ?, timezone = ?, next_due_at = ?,
             last_claimed_due_at = NULL, updated_at = ?
         WHERE task = ?`,
      )
      .run(
        parsed.enabled ? 1 : 0,
        JSON.stringify(parsed.cadence),
        parsed.timezone,
        nextRunAt,
        nowIso,
        parsed.task,
      );
    if (parsed.task === 'ai_processing' && parsed.ai) {
      const setConfig = sqlite.prepare(
        `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      );
      setConfig.run(AUTOMATION_AI_BUDGET_KEY, String(parsed.ai.monthlyBudgetUsd), nowIso);
      setConfig.run(AUTOMATION_AI_CAP_KEY, String(parsed.ai.maxDocumentsPerRun), nowIso);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  return getAutomationSettings(sqlite);
}
