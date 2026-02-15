export const ProcessingStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
} as const;
export type ProcessingStatus = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

export const JobType = {
  SYNC: 'sync',
  ANALYSIS: 'analysis',
  BATCH_OPERATION: 'batch_operation',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const GroupStatus = {
  PENDING: 'pending',
  FALSE_POSITIVE: 'false_positive',
  IGNORED: 'ignored',
  DELETED: 'deleted',
} as const;
export type GroupStatus = (typeof GroupStatus)[keyof typeof GroupStatus];

export const GROUP_STATUS_VALUES: readonly GroupStatus[] = Object.values(GroupStatus);
