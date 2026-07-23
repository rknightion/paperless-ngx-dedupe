import { Cron } from 'croner';

import type { AutomationSchedule, ScheduleCadence } from './types.js';

export type { AutomationSchedule, ScheduleCadence } from './types.js';

export function toCronExpression(cadence: ScheduleCadence): string | null {
  switch (cadence.kind) {
    case 'manual':
      return null;
    case 'interval':
      return `0 0 */${cadence.hours} * * *`;
    case 'daily':
      return `0 ${cadence.minute} ${cadence.hour} * * *`;
    case 'weekly':
      return `0 ${cadence.minute} ${cadence.hour} * * ${cadence.weekday}`;
  }
}

function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function cronFor(schedule: AutomationSchedule): Cron | null {
  const expression = toCronExpression(schedule.cadence);
  if (!schedule.enabled || expression === null || !isValidIanaTimezone(schedule.timezone)) {
    return null;
  }

  try {
    // A Cron instance without a callback only calculates occurrences. Timers and
    // dispatch remain owned by the scheduler coordinator and its SQLite claims.
    return new Cron(expression, { timezone: schedule.timezone });
  } catch {
    return null;
  }
}

function hasScheduledLocalTime(candidate: Date, schedule: AutomationSchedule): boolean {
  if (schedule.cadence.kind === 'manual' || schedule.cadence.kind === 'interval') return true;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: schedule.timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: schedule.cadence.kind === 'weekly' ? 'short' : undefined,
    hourCycle: 'h23',
  }).formatToParts(candidate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  if (
    Number(values.hour) !== schedule.cadence.hour ||
    Number(values.minute) !== schedule.cadence.minute
  ) {
    return false;
  }

  if (schedule.cadence.kind === 'daily') return true;

  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
  return weekday === schedule.cadence.weekday;
}

export function nextOccurrence(schedule: AutomationSchedule, after: Date): Date | null {
  if (Number.isNaN(after.getTime())) return null;
  const cron = cronFor(schedule);
  if (cron === null) return null;

  // Croner's timezone search can enumerate a repeated fall-back wall time before
  // its UTC reference. Select from a bounded candidate set instead of retrying a
  // potentially repeating nextRun() call. Invalid spring-gap wall times are
  // skipped because their rendered local clock fields do not match the cadence.
  return (
    cron
      .nextRuns(3, after)
      .find((candidate) => candidate > after && hasScheduledLocalTime(candidate, schedule)) ?? null
  );
}

export function latestMissedOccurrence(schedule: AutomationSchedule, now: Date): Date | null {
  if (Number.isNaN(now.getTime()) || schedule.nextDueAt === null) return null;

  const nextDueAt = new Date(schedule.nextDueAt);
  if (Number.isNaN(nextDueAt.getTime()) || nextDueAt >= now) return null;

  return cronFor(schedule)?.previousRuns(1, now)[0] ?? null;
}
