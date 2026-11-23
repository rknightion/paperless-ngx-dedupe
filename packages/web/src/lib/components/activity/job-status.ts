import type { ActivityJob, ActivityJobStatus } from '$lib/activity/types';

export interface JobStatusWord {
  /** Mono shape that leads the word, so state never rests on colour alone. */
  shape: string;
  label: string;
  /** Tailwind text colour class for the word. */
  tone: string;
}

const STATUS_WORDS: Record<ActivityJobStatus, JobStatusWord> = {
  pending: { shape: '◇', label: 'Pending', tone: 'text-muted' },
  running: { shape: '▸', label: 'Running', tone: 'text-ink' },
  paused: { shape: '◆', label: 'Paused', tone: 'text-warn' },
  completed: { shape: '■', label: 'Completed', tone: 'text-success' },
  failed: { shape: '●', label: 'Failed', tone: 'text-ember' },
  cancelled: { shape: '○', label: 'Cancelled', tone: 'text-muted' },
};

/** The one status word for a job. A degraded or reconnecting feed outranks the job state. */
export function jobStatusWord(job: Pick<ActivityJob, 'status' | 'connection'>): JobStatusWord {
  if (job.connection === 'degraded') {
    return { shape: '◆', label: 'Updates delayed', tone: 'text-warn' };
  }
  if (job.connection === 'reconnecting') {
    return { shape: '◆', label: 'Reconnecting', tone: 'text-warn' };
  }
  return STATUS_WORDS[job.status];
}

export function jobProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

export function jobDisplayName(type: string): string {
  return type.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
