export const ProcessingStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
} as const;
export type ProcessingStatus = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

export const JobType = {
  SYNC: 'sync',
  ANALYSIS: 'analysis',
  BATCH_OPERATION: 'batch_operation',
  AI_PROCESSING: 'ai_processing',
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

export const AiProvider = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
} as const;
export type AiProvider = (typeof AiProvider)[keyof typeof AiProvider];

export const AiAppliedStatus = {
  PENDING: 'pending',
  APPLIED: 'applied',
  REJECTED: 'rejected',
  PARTIAL: 'partial',
} as const;
export type AiAppliedStatus = (typeof AiAppliedStatus)[keyof typeof AiAppliedStatus];
