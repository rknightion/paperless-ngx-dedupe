import { browser } from '$app/environment';
import { requestJson } from '$lib/api/client';
import { connectJobSSE } from '$lib/sse';
import type { ActivityDiagnostic, ActivityJob, ActivityJobStatus, JobSnapshot } from './types';

const DISCOVERY_INTERVAL_MS = 2_000;
const DEGRADED_AFTER_MS = 10_000;
const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;
const TERMINAL_STATUSES = new Set<ActivityJobStatus>(['completed', 'failed', 'cancelled']);

type Token = { session: number; job: number };
type Connection = { close: () => void; connectionId: number; token: Token };

const state = $state({ jobs: [] as ActivityJob[] });
const connections = new Map<string, Connection>();
const retries = new Map<string, ReturnType<typeof setTimeout>>();
const degradedTimers = new Map<string, ReturnType<typeof setTimeout>>();
const retryAttempts = new Map<string, number>();
const jobGenerations = new Map<string, number>();
const dismissedJobIds = new Set<string>();
let discoveryTimer: ReturnType<typeof setInterval> | undefined;
let startingSession: number | undefined;
let sessionGeneration = 0;
let nextConnectionId = 0;

function isTerminal(status: ActivityJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function findJob(jobId: string): ActivityJob | undefined {
  return state.jobs.find((job) => job.id === jobId);
}

function isCurrent(jobId: string, token: Token): boolean {
  return (
    token.session === sessionGeneration &&
    token.job === jobGenerations.get(jobId) &&
    findJob(jobId) !== undefined
  );
}

function isCurrentConnection(jobId: string, token: Token, connectionId: number): boolean {
  return isCurrent(jobId, token) && connections.get(jobId)?.connectionId === connectionId;
}

function toActivityJob(job: JobSnapshot): ActivityJob {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress ?? 0,
    ...(job.phaseProgress == null ? {} : { phaseProgress: job.phaseProgress }),
    message: job.progressMessage ?? '',
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    connection: isTerminal(job.status) ? 'completed' : 'live',
    diagnostics: [],
  };
}

function updateJob(jobId: string, change: Partial<ActivityJob>, token?: Token): void {
  if (token && !isCurrent(jobId, token)) return;
  const index = state.jobs.findIndex((job) => job.id === jobId);
  if (index !== -1) state.jobs[index] = { ...state.jobs[index], ...change };
}

function addDiagnostic(jobId: string, diagnostic: ActivityDiagnostic, token: Token): void {
  if (!isCurrent(jobId, token)) return;
  const current = findJob(jobId);
  if (current)
    updateJob(jobId, { diagnostics: [...current.diagnostics, diagnostic].slice(-10) }, token);
}

function clearRetry(jobId: string): void {
  const timer = retries.get(jobId);
  if (timer) clearTimeout(timer);
  retries.delete(jobId);
}

function clearDegradedTimer(jobId: string): void {
  const timer = degradedTimers.get(jobId);
  if (timer) clearTimeout(timer);
  degradedTimers.delete(jobId);
}

function closeConnection(jobId: string, connectionId?: number): void {
  const connection = connections.get(jobId);
  if (!connection || (connectionId !== undefined && connection.connectionId !== connectionId))
    return;
  connection.close();
  connections.delete(jobId);
}

function cleanupJob(jobId: string, connectionId?: number): void {
  clearRetry(jobId);
  clearDegradedTimer(jobId);
  closeConnection(jobId, connectionId);
  retryAttempts.delete(jobId);
}

function finish(
  jobId: string,
  status: ActivityJobStatus,
  snapshot: Partial<JobSnapshot>,
  token: Token,
): void {
  if (!isCurrent(jobId, token)) return;
  cleanupJob(jobId);
  updateJob(
    jobId,
    {
      status,
      progress: status === 'completed' ? 1 : (snapshot.progress ?? findJob(jobId)?.progress ?? 0),
      ...(snapshot.phaseProgress == null ? {} : { phaseProgress: snapshot.phaseProgress }),
      ...(snapshot.progressMessage == null ? {} : { message: snapshot.progressMessage }),
      completedAt: snapshot.completedAt ?? new Date().toISOString(),
      connection: 'completed',
    },
    token,
  );
}

function applySnapshot(snapshot: JobSnapshot, token: Token): ActivityJob | undefined {
  if (!isCurrent(snapshot.id, token)) return undefined;
  const existing = findJob(snapshot.id)!;
  updateJob(
    snapshot.id,
    {
      type: snapshot.type,
      status: snapshot.status,
      progress: snapshot.progress ?? existing.progress,
      ...(snapshot.phaseProgress == null ? {} : { phaseProgress: snapshot.phaseProgress }),
      ...(snapshot.progressMessage == null ? {} : { message: snapshot.progressMessage }),
      ...(snapshot.startedAt === undefined ? {} : { startedAt: snapshot.startedAt }),
      ...(snapshot.completedAt === undefined ? {} : { completedAt: snapshot.completedAt }),
      connection: isTerminal(snapshot.status) ? 'completed' : existing.connection,
    },
    token,
  );
  return findJob(snapshot.id);
}

async function refreshJob(jobId: string, token: Token): Promise<ActivityJob | undefined> {
  try {
    const snapshot = await requestJson<JobSnapshot>(
      `/api/v1/jobs/${jobId}`,
      undefined,
      'job activity',
    );
    if (!isCurrent(jobId, token)) return undefined;
    const current = applySnapshot(snapshot, token);
    if (isTerminal(snapshot.status)) finish(jobId, snapshot.status, snapshot, token);
    return current;
  } catch {
    return isCurrent(jobId, token) ? findJob(jobId) : undefined;
  }
}

function retryDelay(attempt: number): number {
  const capped = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.round(capped * (0.8 + Math.random() * 0.4));
}

function scheduleDegradedState(jobId: string, token: Token): void {
  if (degradedTimers.has(jobId)) return;
  degradedTimers.set(
    jobId,
    setTimeout(() => {
      degradedTimers.delete(jobId);
      const current = findJob(jobId);
      if (!current || !isCurrent(jobId, token) || isTerminal(current.status)) return;
      updateJob(jobId, { connection: 'degraded' }, token);
      addDiagnostic(
        jobId,
        {
          code: 'connection_recovery',
          message:
            'Live updates are delayed; checking the job status until the connection recovers.',
          occurredAt: new Date().toISOString(),
        },
        token,
      );
    }, DEGRADED_AFTER_MS),
  );
}

async function recoverConnection(jobId: string, token: Token, connectionId: number): Promise<void> {
  if (!isCurrentConnection(jobId, token, connectionId)) return;
  closeConnection(jobId, connectionId);
  scheduleDegradedState(jobId, token);
  const current = await refreshJob(jobId, token);
  if (!current || !isCurrent(jobId, token) || isTerminal(current.status)) return;

  updateJob(
    jobId,
    { connection: findJob(jobId)?.connection === 'degraded' ? 'degraded' : 'reconnecting' },
    token,
  );
  const attempt = retryAttempts.get(jobId) ?? 0;
  retryAttempts.set(jobId, attempt + 1);
  clearRetry(jobId);
  retries.set(
    jobId,
    setTimeout(() => {
      retries.delete(jobId);
      if (isCurrent(jobId, token)) void connect(jobId, token);
    }, retryDelay(attempt)),
  );
}

async function connect(jobId: string, token: Token): Promise<void> {
  if (!browser || !isCurrent(jobId, token) || connections.has(jobId)) return;
  const refreshed = await refreshJob(jobId, token);
  if (
    !refreshed ||
    !isCurrent(jobId, token) ||
    isTerminal(refreshed.status) ||
    connections.has(jobId)
  )
    return;

  const connectionId = ++nextConnectionId;
  const connection = connectJobSSE(jobId, {
    onProgress: (event) => {
      if (!isCurrentConnection(jobId, token, connectionId)) return;
      const status = (event.status ?? findJob(jobId)?.status ?? 'running') as ActivityJobStatus;
      if (isTerminal(status)) {
        return finish(
          jobId,
          status,
          {
            progress: event.progress,
            phaseProgress: event.phaseProgress,
            progressMessage: event.message,
          },
          token,
        );
      }
      clearDegradedTimer(jobId);
      retryAttempts.delete(jobId);
      updateJob(
        jobId,
        {
          status,
          progress: event.progress,
          ...(event.phaseProgress == null ? {} : { phaseProgress: event.phaseProgress }),
          ...(event.message == null ? {} : { message: event.message }),
          connection: 'live',
        },
        token,
      );
    },
    onComplete: (event) => {
      if (isCurrentConnection(jobId, token, connectionId)) {
        finish(
          jobId,
          event.status as ActivityJobStatus,
          {
            progress: event.progress,
            phaseProgress: event.phaseProgress,
            progressMessage: event.message,
          },
          token,
        );
      }
    },
    onDiagnostic: (diagnostic) => {
      addDiagnostic(jobId, { ...diagnostic, occurredAt: new Date().toISOString() }, token);
    },
    onError: () => void recoverConnection(jobId, token, connectionId),
  });
  if (!isCurrent(jobId, token)) {
    connection.close();
    return;
  }
  connections.set(jobId, { close: connection.close, connectionId, token });
}

async function discover(): Promise<void> {
  if (!browser) return;
  const session = sessionGeneration;
  try {
    const jobs = await requestJson<JobSnapshot[]>(
      '/api/v1/jobs?limit=200',
      undefined,
      'job activity',
    );
    if (session !== sessionGeneration) return;
    for (const job of jobs) {
      if (!isTerminal(job.status) && !dismissedJobIds.has(job.id)) activity.track(job.id);
    }
  } catch {
    // Keep the last safe state; the next scheduled discovery retries.
  }
}

export const activity = {
  get jobs(): ActivityJob[] {
    return state.jobs;
  },

  async start(): Promise<void> {
    if (!browser || discoveryTimer || startingSession !== undefined) return;
    const session = sessionGeneration;
    startingSession = session;
    // A fresh start represents a new mounted browser session; only then may a dismissed job return.
    dismissedJobIds.clear();
    try {
      await discover();
      if (startingSession !== session || sessionGeneration !== session || discoveryTimer) return;
      discoveryTimer = setInterval(() => void discover(), DISCOVERY_INTERVAL_MS);
    } finally {
      if (startingSession === session) startingSession = undefined;
    }
  },

  track(jobId: string): void {
    if (!browser || dismissedJobIds.has(jobId) || findJob(jobId)) return;
    const token = { session: sessionGeneration, job: (jobGenerations.get(jobId) ?? 0) + 1 };
    jobGenerations.set(jobId, token.job);
    state.jobs.push({
      id: jobId,
      type: 'job',
      status: 'pending',
      progress: 0,
      message: 'Starting…',
      connection: 'live',
      diagnostics: [],
    });
    void connect(jobId, token);
  },

  dismiss(jobId: string): void {
    dismissedJobIds.add(jobId);
    jobGenerations.set(jobId, (jobGenerations.get(jobId) ?? 0) + 1);
    cleanupJob(jobId);
    state.jobs = state.jobs.filter((job) => job.id !== jobId);
  },

  stop(): void {
    sessionGeneration += 1;
    startingSession = undefined;
    if (discoveryTimer) clearInterval(discoveryTimer);
    discoveryTimer = undefined;
    for (const jobId of [...connections.keys()]) cleanupJob(jobId);
    for (const jobId of [...retries.keys()]) clearRetry(jobId);
    for (const jobId of [...degradedTimers.keys()]) clearDegradedTimer(jobId);
    retryAttempts.clear();
    jobGenerations.clear();
    state.jobs = [];
  },
};
