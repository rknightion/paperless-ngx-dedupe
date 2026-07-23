export type ActivityJobStatus =
  'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type ActivityConnectionState = 'live' | 'reconnecting' | 'degraded' | 'completed';

export interface ActivityDiagnostic {
  code: 'malformed_event' | 'connection_recovery';
  message: string;
  occurredAt: string;
}

export interface ActivityJob {
  id: string;
  type: string;
  status: ActivityJobStatus;
  progress: number;
  phaseProgress?: number;
  message: string;
  startedAt?: string | null;
  completedAt?: string | null;
  connection: ActivityConnectionState;
  diagnostics: readonly ActivityDiagnostic[];
}

export interface JobSnapshot {
  id: string;
  type: string;
  status: ActivityJobStatus;
  progress: number | null;
  phaseProgress?: number | null;
  progressMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}
