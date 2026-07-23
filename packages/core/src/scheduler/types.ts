export type ScheduleTask = 'sync' | 'analysis' | 'ai_processing';

export type ScheduleCadence =
  | { kind: 'manual' }
  | { kind: 'interval'; hours: 2 | 4 | 6 | 12 }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; hour: number; minute: number };

/** The persisted schedule shape required to calculate, but never dispatch, an occurrence. */
export interface AutomationSchedule {
  id: string;
  task: ScheduleTask;
  enabled: boolean;
  cadence: ScheduleCadence;
  timezone: string;
  nextDueAt: string | null;
  lastClaimedDueAt: string | null;
}
