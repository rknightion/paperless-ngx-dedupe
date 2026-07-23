import { describe, expect, it } from 'vitest';

import {
  latestMissedOccurrence,
  nextOccurrence,
  toCronExpression,
  type AutomationSchedule,
} from '../occurrences.js';

function schedule(overrides: Partial<AutomationSchedule> = {}): AutomationSchedule {
  return {
    id: 'schedule-1',
    task: 'sync',
    enabled: true,
    cadence: { kind: 'interval', hours: 2 },
    timezone: 'UTC',
    nextDueAt: '2026-07-23T02:00:00.000Z',
    lastClaimedDueAt: null,
    ...overrides,
  };
}

describe('toCronExpression', () => {
  it.each([
    [{ kind: 'interval', hours: 2 }, '0 0 */2 * * *'],
    [{ kind: 'interval', hours: 4 }, '0 0 */4 * * *'],
    [{ kind: 'interval', hours: 6 }, '0 0 */6 * * *'],
    [{ kind: 'interval', hours: 12 }, '0 0 */12 * * *'],
    [{ kind: 'daily', hour: 9, minute: 30 }, '0 30 9 * * *'],
    [{ kind: 'weekly', weekday: 1, hour: 8, minute: 15 }, '0 15 8 * * 1'],
  ] as const)('converts %o to %s', (cadence, expression) => {
    expect(toCronExpression(cadence)).toBe(expression);
  });
});

describe('nextOccurrence', () => {
  it('calculates the next occurrence for every supported interval', () => {
    const after = new Date('2026-07-23T01:59:59.999Z');

    expect(nextOccurrence(schedule({ cadence: { kind: 'interval', hours: 2 } }), after)).toEqual(
      new Date('2026-07-23T02:00:00.000Z'),
    );
    expect(nextOccurrence(schedule({ cadence: { kind: 'interval', hours: 4 } }), after)).toEqual(
      new Date('2026-07-23T04:00:00.000Z'),
    );
    expect(nextOccurrence(schedule({ cadence: { kind: 'interval', hours: 6 } }), after)).toEqual(
      new Date('2026-07-23T06:00:00.000Z'),
    );
    expect(nextOccurrence(schedule({ cadence: { kind: 'interval', hours: 12 } }), after)).toEqual(
      new Date('2026-07-23T12:00:00.000Z'),
    );
  });

  it('calculates daily and weekly occurrences in the schedule IANA timezone', () => {
    expect(
      nextOccurrence(
        schedule({
          cadence: { kind: 'daily', hour: 9, minute: 30 },
          timezone: 'Europe/London',
        }),
        new Date('2026-07-23T08:29:59.000Z'),
      ),
    ).toEqual(new Date('2026-07-23T08:30:00.000Z'));

    expect(
      nextOccurrence(
        schedule({
          cadence: { kind: 'weekly', weekday: 1, hour: 8, minute: 15 },
          timezone: 'America/New_York',
        }),
        new Date('2026-07-19T12:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-07-20T12:15:00.000Z'));
  });

  it('uses DST-aware IANA timezone calculations across the spring-forward and fall-back changes', () => {
    const londonDaily = schedule({
      cadence: { kind: 'daily', hour: 9, minute: 30 },
      timezone: 'Europe/London',
    });

    expect(nextOccurrence(londonDaily, new Date('2026-03-28T10:00:00.000Z'))).toEqual(
      new Date('2026-03-29T08:30:00.000Z'),
    );
    expect(nextOccurrence(londonDaily, new Date('2026-10-24T10:00:00.000Z'))).toEqual(
      new Date('2026-10-25T09:30:00.000Z'),
    );
  });

  it('skips the nonexistent spring-gap wall time and never returns a past fall-repeat occurrence', () => {
    const londonOneThirty = schedule({
      cadence: { kind: 'daily', hour: 1, minute: 30 },
      timezone: 'Europe/London',
    });

    // Policy: a nonexistent local spring time is skipped; the next valid day is used.
    expect(nextOccurrence(londonOneThirty, new Date('2026-03-29T00:29:59.000Z'))).toEqual(
      new Date('2026-03-30T00:30:00.000Z'),
    );

    // Policy: the repeated fall-back wall time runs once, at its first instant.
    expect(nextOccurrence(londonOneThirty, new Date('2026-10-25T00:29:59.000Z'))).toEqual(
      new Date('2026-10-25T00:30:00.000Z'),
    );
    expect(nextOccurrence(londonOneThirty, new Date('2026-10-25T00:30:00.000Z'))).toEqual(
      new Date('2026-10-26T01:30:00.000Z'),
    );
    expect(nextOccurrence(londonOneThirty, new Date('2026-10-25T01:29:59.000Z'))).toEqual(
      new Date('2026-10-26T01:30:00.000Z'),
    );
    expect(nextOccurrence(londonOneThirty, new Date('2026-10-25T01:30:00.000Z'))).toEqual(
      new Date('2026-10-26T01:30:00.000Z'),
    );
    expect(nextOccurrence(londonOneThirty, new Date('2026-10-25T01:30:01.000Z'))).toEqual(
      new Date('2026-10-26T01:30:00.000Z'),
    );
  });

  it('is exclusive at an exact scheduled boundary', () => {
    expect(nextOccurrence(schedule(), new Date('2026-07-23T02:00:00.000Z'))).toEqual(
      new Date('2026-07-23T04:00:00.000Z'),
    );
  });

  it.each([
    schedule({ enabled: false }),
    schedule({ cadence: { kind: 'manual' } }),
    schedule({ timezone: 'Not/A_Real_Timezone' }),
  ])('returns null for non-calculable schedules', (automationSchedule) => {
    expect(nextOccurrence(automationSchedule, new Date('2026-07-23T01:00:00.000Z'))).toBeNull();
  });
});

describe('latestMissedOccurrence', () => {
  it('returns at most the latest schedule occurrence after a due time has been missed', () => {
    expect(
      latestMissedOccurrence(
        schedule({ nextDueAt: '2026-07-23T02:00:00.000Z' }),
        new Date('2026-07-23T09:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-07-23T08:00:00.000Z'));
  });

  it('does not treat an exactly due occurrence as missed', () => {
    expect(
      latestMissedOccurrence(
        schedule({ nextDueAt: '2026-07-23T02:00:00.000Z' }),
        new Date('2026-07-23T02:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it.each([
    schedule({ nextDueAt: null }),
    schedule({ nextDueAt: '2026-07-23T04:00:00.000Z' }),
    schedule({ enabled: false }),
    schedule({ cadence: { kind: 'manual' } }),
    schedule({ timezone: 'Not/A_Real_Timezone' }),
  ])('returns null when no occurrence has been missed', (automationSchedule) => {
    expect(
      latestMissedOccurrence(automationSchedule, new Date('2026-07-23T02:00:00.000Z')),
    ).toBeNull();
  });
});
