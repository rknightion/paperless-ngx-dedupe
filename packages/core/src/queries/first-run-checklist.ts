import type { AppDatabase } from '../db/client.js';
import { getConfig, setConfig } from './config.js';

/** Registered database config key, so the dismissal lives with the app config (no migration). */
export const FIRST_RUN_DISMISSED_KEY = 'ui.firstRunChecklistDismissed';

export const FIRST_RUN_STEP_IDS = ['connect', 'sync', 'analysis'] as const;
export type FirstRunStepId = (typeof FIRST_RUN_STEP_IDS)[number];

export interface FirstRunSignals {
  paperlessConnected: boolean;
  synced: boolean;
  analysed: boolean;
}

export interface FirstRunChecklistState {
  steps: { id: FirstRunStepId; done: boolean }[];
  doneCount: number;
  allDone: boolean;
  dismissed: boolean;
  /** False only when the checklist was dismissed and every step is still done. */
  visible: boolean;
  /** Steps that are unmet after a dismissal, in step order. Empty before any dismissal. */
  regressed: FirstRunStepId[];
}

/**
 * Pure rule. A dismissal can only happen once every step is done, so a dismissed
 * checklist with an unmet step means that step regressed.
 */
export function evaluateFirstRunChecklist(
  signals: FirstRunSignals,
  dismissed: boolean,
): FirstRunChecklistState {
  const done: Record<FirstRunStepId, boolean> = {
    connect: signals.paperlessConnected,
    sync: signals.synced,
    analysis: signals.analysed,
  };
  const steps = FIRST_RUN_STEP_IDS.map((id) => ({ id, done: done[id] }));
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;
  return {
    steps,
    doneCount,
    allDone,
    dismissed,
    visible: !(dismissed && allDone),
    regressed: dismissed ? steps.filter((step) => !step.done).map((step) => step.id) : [],
  };
}

export function getFirstRunChecklistDismissed(db: AppDatabase): boolean {
  return getConfig(db)[FIRST_RUN_DISMISSED_KEY] === 'true';
}

export function setFirstRunChecklistDismissed(db: AppDatabase, dismissed: boolean): boolean {
  setConfig(db, FIRST_RUN_DISMISSED_KEY, dismissed);
  return getFirstRunChecklistDismissed(db);
}

export function getFirstRunChecklist(
  db: AppDatabase,
  signals: FirstRunSignals,
): FirstRunChecklistState {
  return evaluateFirstRunChecklist(signals, getFirstRunChecklistDismissed(db));
}
