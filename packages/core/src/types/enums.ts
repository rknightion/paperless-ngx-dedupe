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

export const DuplicateResolution = {
  UNRESOLVED: 'unresolved',
  KEPT: 'kept',
  DELETED: 'deleted',
  MERGED: 'merged',
} as const;
export type DuplicateResolution = (typeof DuplicateResolution)[keyof typeof DuplicateResolution];
