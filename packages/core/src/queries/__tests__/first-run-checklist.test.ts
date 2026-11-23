import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseWithHandle, type AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { coerceConfigBatch } from '../../config/registry.js';
import {
  FIRST_RUN_DISMISSED_KEY,
  evaluateFirstRunChecklist,
  getFirstRunChecklist,
  getFirstRunChecklistDismissed,
  setFirstRunChecklistDismissed,
} from '../first-run-checklist.js';
import { getConfig } from '../config.js';

const allDone = { paperlessConnected: true, synced: true, analysed: true };

describe('evaluateFirstRunChecklist', () => {
  it('keeps the checklist visible with no regression while setup is unfinished', () => {
    const state = evaluateFirstRunChecklist(
      { paperlessConnected: true, synced: false, analysed: false },
      false,
    );

    expect(state.steps.map((step) => [step.id, step.done])).toEqual([
      ['connect', true],
      ['sync', false],
      ['analysis', false],
    ]);
    expect(state.doneCount).toBe(1);
    expect(state.allDone).toBe(false);
    expect(state.visible).toBe(true);
    expect(state.regressed).toEqual([]);
  });

  it('shows the collapsed row, not a regression, when setup completes undismissed', () => {
    const state = evaluateFirstRunChecklist(allDone, false);

    expect(state.allDone).toBe(true);
    expect(state.visible).toBe(true);
    expect(state.regressed).toEqual([]);
  });

  it('hides the checklist once dismissed with every step still done', () => {
    const state = evaluateFirstRunChecklist(allDone, true);

    expect(state.visible).toBe(false);
    expect(state.regressed).toEqual([]);
  });

  it.each([
    ['connect', { ...allDone, paperlessConnected: false }],
    ['sync', { ...allDone, synced: false }],
    ['analysis', { ...allDone, analysed: false }],
  ] as const)('returns and names the %s step when it regresses after dismissal', (id, signals) => {
    const state = evaluateFirstRunChecklist(signals, true);

    expect(state.visible).toBe(true);
    expect(state.regressed).toEqual([id]);
  });

  it('names every regressed step, in step order', () => {
    const state = evaluateFirstRunChecklist(
      { paperlessConnected: false, synced: true, analysed: false },
      true,
    );

    expect(state.regressed).toEqual(['connect', 'analysis']);
  });
});

describe('first-run checklist dismissal', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('is registered as a database config key, so no migration is needed', () => {
    expect(coerceConfigBatch({ [FIRST_RUN_DISMISSED_KEY]: true })).toEqual({
      [FIRST_RUN_DISMISSED_KEY]: 'true',
    });
  });

  it('defaults to not dismissed', () => {
    expect(getFirstRunChecklistDismissed(db)).toBe(false);
  });

  it('persists the dismissal in the app config store', () => {
    expect(setFirstRunChecklistDismissed(db, true)).toBe(true);

    expect(getConfig(db)[FIRST_RUN_DISMISSED_KEY]).toBe('true');
    expect(getFirstRunChecklistDismissed(db)).toBe(true);
  });

  it('can be reset', () => {
    setFirstRunChecklistDismissed(db, true);
    setFirstRunChecklistDismissed(db, false);

    expect(getFirstRunChecklistDismissed(db)).toBe(false);
  });

  it('treats a corrupt stored value as not dismissed', () => {
    db.$client
      .prepare('INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
      .run(FIRST_RUN_DISMISSED_KEY, 'maybe', new Date().toISOString());

    expect(getFirstRunChecklistDismissed(db)).toBe(false);
  });

  it('getFirstRunChecklist combines the stored dismissal with live signals', () => {
    expect(getFirstRunChecklist(db, allDone).visible).toBe(true);

    setFirstRunChecklistDismissed(db, true);

    expect(getFirstRunChecklist(db, allDone).visible).toBe(false);
    expect(getFirstRunChecklist(db, { ...allDone, analysed: false })).toMatchObject({
      visible: true,
      regressed: ['analysis'],
    });
  });
});
