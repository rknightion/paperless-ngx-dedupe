import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';

import { latestMissedOccurrence, nextOccurrence } from './occurrences.js';
import type { AutomationSchedule, ScheduleTask } from './types.js';
import {
  deserializeDispatchTaskData,
  OPERATION_COMPATIBILITY,
  serializeDispatchTaskData,
  type DispatchTaskData,
  type OperationKind,
} from './store.js';
import type { DispatchIntent, OperationLease } from '../schema/types.js';

type ScheduleRow = {
  id: string;
  task: ScheduleTask;
  enabled: number;
  cadence_json: string;
  timezone: string;
  next_due_at: string | null;
  last_claimed_due_at: string | null;
};

type SyncGenerationRow = {
  id: string;
  sync_job_id: string;
  root_schedule_id: string | null;
  root_due_at: string | null;
};

const DISPATCH_CLAIM_DURATION_MS = 5 * 60 * 1000;
const LAUNCH_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 300_000] as const;

export interface DispatchExecutor {
  launchIntent(intentId: string, idempotencyKey: string): Promise<void>;
}

/** Runtime-owned executor binding used by the SQLite-backed coordinator. */
export interface SchedulerDispatchExecutor extends DispatchExecutor {
  sqlite: Database.Database;
}

export interface SchedulerTickResult {
  dispatched: number;
  retried: number;
  deadLettered: number;
}

export type ResolvedDispatchIntent = DispatchIntent & { taskData: unknown };

export class OperationConflictError extends Error {
  constructor(operation: OperationKind) {
    super(`Operation '${operation}' is incompatible with an active operation`);
    this.name = 'OperationConflictError';
  }
}

export class OperationLeaseOwnershipError extends Error {
  constructor(operation: OperationKind) {
    super(`Worker does not own the required '${operation}' operation lease`);
    this.name = 'OperationLeaseOwnershipError';
  }
}

export function assertOperationLeaseOwnership(
  sqlite: Database.Database,
  operation: OperationKind,
  ownerId: string,
): void {
  const lease = sqlite
    .prepare('SELECT 1 FROM operation_lease WHERE operation = ? AND owner_id = ?')
    .get(operation, ownerId);
  if (!lease) throw new OperationLeaseOwnershipError(operation);
}

function operationForTask(task: OperationKind): OperationKind {
  return task;
}

function toSchedule(row: ScheduleRow): AutomationSchedule | null {
  try {
    return {
      id: row.id,
      task: row.task,
      enabled: Boolean(row.enabled),
      cadence: JSON.parse(row.cadence_json),
      timezone: row.timezone,
      nextDueAt: row.next_due_at,
      lastClaimedDueAt: row.last_claimed_due_at,
    };
  } catch {
    return null;
  }
}

function asIntent(sqlite: Database.Database, id: string): ResolvedDispatchIntent {
  const result = sqlite
    .prepare(
      `SELECT
        id, task, operation, job_id AS jobId, trigger_kind AS triggerKind,
        schedule_id AS scheduleId, due_at AS dueAt, parent_job_id AS parentJobId,
        root_schedule_id AS rootScheduleId, root_due_at AS rootDueAt, status,
        attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt,
        terminal_reason AS terminalReason, task_data_json AS taskDataJson, dispatch_key AS dispatchKey,
        dispatch_claim_token AS dispatchClaimToken, dispatch_claimed_at AS dispatchClaimedAt,
        dispatch_claim_expires_at AS dispatchClaimExpiresAt,
        created_at AS createdAt, updated_at AS updatedAt
       FROM dispatch_intent WHERE id = ?`,
    )
    .get(id);
  if (!result) throw new Error(`Dispatch intent '${id}' was not persisted`);
  const intent = result as DispatchIntent;
  return { ...intent, taskData: deserializeDispatchTaskData(intent.taskDataJson) };
}

/** Resolves the durable payload that an executor needs after a restart or retry. */
export function getDispatchIntent(sqlite: Database.Database, id: string): ResolvedDispatchIntent {
  return asIntent(sqlite, id);
}

/**
 * Acquires a compatibility lease for a pending/running operation. This helper
 * deliberately does not open a transaction: callers combine it with their
 * occurrence and intent writes inside one BEGIN IMMEDIATE transaction.
 */
export function acquireOperation(
  sqlite: Database.Database,
  operation: OperationKind,
  ownerId: string,
): OperationLease {
  const nowIso = new Date().toISOString();
  const active = sqlite.prepare('SELECT operation FROM operation_lease').all() as {
    operation: OperationKind;
  }[];
  if (active.some((lease) => !OPERATION_COMPATIBILITY[operation][lease.operation])) {
    throw new OperationConflictError(operation);
  }

  const id = nanoid();
  sqlite
    .prepare(
      `INSERT INTO operation_lease (id, operation, owner_id, acquired_at, heartbeat_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .run(id, operation, ownerId, nowIso, nowIso);
  return { id, operation, ownerId, acquiredAt: nowIso, heartbeatAt: nowIso, expiresAt: null };
}

export function renewOperationLease(
  sqlite: Database.Database,
  ownerId: string,
  now: Date,
): boolean {
  const result = sqlite
    .prepare('UPDATE operation_lease SET heartbeat_at = ? WHERE owner_id = ?')
    .run(now.toISOString(), ownerId);
  return result.changes === 1;
}

export function releaseOperation(sqlite: Database.Database, ownerId: string): boolean {
  const result = sqlite.prepare('DELETE FROM operation_lease WHERE owner_id = ?').run(ownerId);
  return result.changes === 1;
}

function claimSchedule(
  sqlite: Database.Database,
  row: ScheduleRow,
  now: Date,
): DispatchIntent | null {
  const schedule = toSchedule(row);
  if (!schedule || !schedule.enabled || schedule.nextDueAt === null) return null;

  const nextDue = new Date(schedule.nextDueAt);
  if (Number.isNaN(nextDue.getTime()) || nextDue > now) return null;
  const due = nextDue < now ? (latestMissedOccurrence(schedule, now) ?? nextDue) : nextDue;
  const dueAt = due.toISOString();
  const nowIso = now.toISOString();
  const jobId = nanoid();
  const intentId = nanoid();
  const dispatchKey = nanoid();

  // The schedule predicate makes a second tick a no-op after the first claim.
  const claim = sqlite
    .prepare(
      `UPDATE automation_schedule
       SET last_claimed_due_at = ?, updated_at = ?
       WHERE id = ? AND enabled = 1 AND next_due_at = ?`,
    )
    .run(dueAt, nowIso, row.id, row.next_due_at);
  if (claim.changes !== 1) return null;

  acquireOperation(sqlite, operationForTask(row.task), jobId);
  const next = nextOccurrence({ ...schedule, lastClaimedDueAt: dueAt }, due);
  sqlite
    .prepare('UPDATE automation_schedule SET next_due_at = ?, updated_at = ? WHERE id = ?')
    .run(next?.toISOString() ?? null, nowIso, row.id);
  sqlite
    .prepare(
      `INSERT INTO job (
        id, type, status, progress, trigger_kind, schedule_id, due_at,
        parent_job_id, root_schedule_id, root_due_at, attempt, next_attempt_at,
        terminal_reason, created_at
      ) VALUES (?, ?, 'pending', 0, 'schedule', ?, ?, NULL, NULL, NULL, 0, NULL, NULL, ?)`,
    )
    .run(jobId, row.task, row.id, dueAt, nowIso);
  if (row.task === 'sync') {
    sqlite
      .prepare(
        `INSERT INTO sync_change_generation (
          id, sync_job_id, root_schedule_id, root_due_at, changed_at,
          status, created_at, completed_at
        ) VALUES (?, ?, ?, ?, NULL, 'running', ?, NULL)`,
      )
      .run(nanoid(), jobId, row.id, dueAt, nowIso);
  }
  sqlite
    .prepare(
      `INSERT INTO dispatch_intent (
        id, task, operation, job_id, trigger_kind, schedule_id, due_at,
        parent_job_id, root_schedule_id, root_due_at, status, attempt_count,
        next_attempt_at, terminal_reason, task_data_json, dispatch_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'schedule', ?, ?, NULL, NULL, NULL, 'pending', 0, NULL, NULL, NULL, ?, ?, ?)`,
    )
    .run(
      intentId,
      row.task,
      operationForTask(row.task),
      jobId,
      row.id,
      dueAt,
      dispatchKey,
      nowIso,
      nowIso,
    );
  return asIntent(sqlite, intentId);
}

function claimDependency(
  sqlite: Database.Database,
  parent: SyncGenerationRow,
  task: Exclude<ScheduleTask, 'sync'>,
  now: Date,
): DispatchIntent | null {
  if (!parent.root_schedule_id || !parent.root_due_at) return null;
  const nowIso = now.toISOString();
  const existing = sqlite
    .prepare('SELECT id FROM dispatch_intent WHERE parent_job_id = ? AND task = ?')
    .get(parent.sync_job_id, task);
  if (existing) return null;

  const jobId = nanoid();
  const intentId = nanoid();
  const dispatchKey = nanoid();
  const taskDataJson = serializeDispatchTaskData({ syncGenerationId: parent.id });
  acquireOperation(sqlite, operationForTask(task), jobId);
  sqlite
    .prepare(
      `INSERT INTO job (
        id, type, status, progress, trigger_kind, schedule_id, due_at,
        parent_job_id, root_schedule_id, root_due_at, attempt, next_attempt_at,
        terminal_reason, created_at
      ) VALUES (?, ?, 'pending', 0, 'dependency', NULL, NULL, ?, ?, ?, 0, NULL, NULL, ?)`,
    )
    .run(jobId, task, parent.sync_job_id, parent.root_schedule_id, parent.root_due_at, nowIso);
  sqlite
    .prepare(
      `INSERT INTO dispatch_intent (
        id, task, operation, job_id, trigger_kind, schedule_id, due_at,
        parent_job_id, root_schedule_id, root_due_at, status, attempt_count,
        next_attempt_at, terminal_reason, task_data_json, dispatch_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'dependency', NULL, NULL, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, ?, ?)`,
    )
    .run(
      intentId,
      task,
      operationForTask(task),
      jobId,
      parent.sync_job_id,
      parent.root_schedule_id,
      parent.root_due_at,
      taskDataJson,
      dispatchKey,
      nowIso,
      nowIso,
    );
  return asIntent(sqlite, intentId);
}

function enqueueCompletedDependencies(sqlite: Database.Database, now: Date): DispatchIntent[] {
  const schedules = sqlite
    .prepare(
      `SELECT task FROM automation_schedule
       WHERE enabled = 1 AND task IN ('analysis', 'ai_processing')`,
    )
    .all() as { task: Exclude<ScheduleTask, 'sync'> }[];
  if (schedules.length === 0) return [];

  const parents = sqlite
    .prepare(
      `SELECT id, sync_job_id, root_schedule_id, root_due_at
       FROM sync_change_generation
       WHERE status = 'ready'`,
    )
    .all() as SyncGenerationRow[];
  const intents: DispatchIntent[] = [];
  for (const parent of parents) {
    for (const schedule of schedules) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const intent = claimDependency(sqlite, parent, schedule.task, now);
        sqlite.exec('COMMIT');
        if (intent) intents.push(intent);
      } catch (error) {
        sqlite.exec('ROLLBACK');
        if (!(error instanceof OperationConflictError)) throw error;
      }
    }
  }
  return intents;
}

/** Claims at most one due occurrence per schedule using a single immediate transaction. */
export function enqueueDueSchedules(sqlite: Database.Database, now: Date): DispatchIntent[] {
  const nowIso = now.toISOString();
  const rows = sqlite
    .prepare(
      `SELECT id, task, enabled, cadence_json, timezone, next_due_at, last_claimed_due_at
       FROM automation_schedule
       WHERE enabled = 1 AND next_due_at IS NOT NULL AND next_due_at <= ?`,
    )
    .all(nowIso) as ScheduleRow[];
  const intents = enqueueCompletedDependencies(sqlite, now);

  for (const row of rows) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const claimed = claimSchedule(sqlite, row, now);
      sqlite.exec('COMMIT');
      if (claimed) intents.push(claimed);
    } catch (error) {
      sqlite.exec('ROLLBACK');
      if (!(error instanceof OperationConflictError)) throw error;
    }
  }
  return intents;
}

/**
 * Creates the same durable job/intent pair used by a scheduled occurrence.
 * The caller may dispatch the returned intent only after this transaction has
 * committed, so a request crash can never lose an accepted manual operation.
 */
export function enqueueManualOperation(
  sqlite: Database.Database,
  task: OperationKind,
  trigger: { kind: 'manual' },
  jobType: string = task,
  taskData?: DispatchTaskData,
): DispatchIntent {
  if (trigger.kind !== 'manual') throw new Error('Manual dispatch requires a manual trigger');

  const nowIso = new Date().toISOString();
  const jobId = nanoid();
  const intentId = nanoid();
  const dispatchKey = nanoid();
  const taskDataJson = serializeDispatchTaskData(taskData);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    acquireOperation(sqlite, operationForTask(task), jobId);
    sqlite
      .prepare(
        `INSERT INTO job (
          id, type, status, progress, trigger_kind, schedule_id, due_at,
          parent_job_id, root_schedule_id, root_due_at, attempt, next_attempt_at,
          terminal_reason, created_at
        ) VALUES (?, ?, 'pending', 0, 'manual', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?)`,
      )
      .run(jobId, jobType, nowIso);
    sqlite
      .prepare(
        `INSERT INTO dispatch_intent (
          id, task, operation, job_id, trigger_kind, schedule_id, due_at,
          parent_job_id, root_schedule_id, root_due_at, status, attempt_count,
          next_attempt_at, terminal_reason, task_data_json, dispatch_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'manual', NULL, NULL, NULL, NULL, NULL, 'pending', 0, NULL, NULL, ?, ?, ?, ?)`,
      )
      .run(
        intentId,
        task,
        operationForTask(task),
        jobId,
        taskDataJson,
        dispatchKey,
        nowIso,
        nowIso,
      );
    sqlite.exec('COMMIT');
    return asIntent(sqlite, intentId);
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Launches durable intents after their creation transaction has committed.
 * A launch is at-least-once across a process crash; dispatchers must make
 * launchIntent idempotent by dispatch key before starting a worker. The executor
 * resolves durable route options with getDispatchIntent(intentId).
 */
export async function consumeDispatchIntents(
  executor: SchedulerDispatchExecutor,
  now: Date,
): Promise<SchedulerTickResult> {
  const { sqlite } = executor;
  const nowIso = now.toISOString();
  const claimExpiresAt = new Date(now.getTime() + DISPATCH_CLAIM_DURATION_MS).toISOString();
  // A recovery is intentionally limited to an expired claim. Ordinary ticks
  // never re-select a live dispatching intent, even on another DB connection.
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite
      .prepare(
        `UPDATE dispatch_intent
         SET status = 'pending', dispatch_claim_token = NULL, dispatch_claimed_at = NULL,
             dispatch_claim_expires_at = NULL, updated_at = ?
         WHERE status = 'dispatching' AND dispatch_claim_expires_at IS NOT NULL
           AND dispatch_claim_expires_at <= ?`,
      )
      .run(nowIso, nowIso);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  const candidates = sqlite
    .prepare(
      `SELECT id, job_id AS jobId, attempt_count AS attemptCount, dispatch_key AS dispatchKey
       FROM dispatch_intent
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC`,
    )
    .all(nowIso) as {
    id: string;
    jobId: string;
    attemptCount: number;
    dispatchKey: string | null;
  }[];
  const result: SchedulerTickResult = { dispatched: 0, retried: 0, deadLettered: 0 };

  for (const candidate of candidates) {
    const claimToken = nanoid();
    const claimed = sqlite
      .prepare(
        `UPDATE dispatch_intent
         SET status = 'dispatching', dispatch_claim_token = ?, dispatch_claimed_at = ?,
             dispatch_claim_expires_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
      )
      .run(claimToken, nowIso, claimExpiresAt, nowIso, candidate.id, nowIso);
    if (claimed.changes !== 1) continue;

    try {
      await executor.launchIntent(candidate.id, candidate.dispatchKey ?? candidate.id);
      const dispatched = sqlite
        .prepare(
          `UPDATE dispatch_intent
           SET status = 'dispatched', next_attempt_at = NULL, dispatch_claim_expires_at = NULL,
               updated_at = ?
           WHERE id = ? AND status = 'dispatching' AND dispatch_claim_token = ?`,
        )
        .run(nowIso, candidate.id, claimToken);
      if (dispatched.changes === 1) result.dispatched += 1;
    } catch (error) {
      const nextAttempt = candidate.attemptCount + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (nextAttempt > LAUNCH_RETRY_DELAYS_MS.length) {
        let claimedTerminalTransition: boolean;
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const deadLettered = sqlite
            .prepare(
              `UPDATE dispatch_intent
               SET status = 'dead_letter', attempt_count = ?, next_attempt_at = NULL,
                   terminal_reason = ?, dispatch_claim_expires_at = NULL, updated_at = ?
               WHERE id = ? AND status = 'dispatching' AND dispatch_claim_token = ?`,
            )
            .run(
              nextAttempt,
              `worker_launch_exhausted: ${message}`,
              nowIso,
              candidate.id,
              claimToken,
            );
          claimedTerminalTransition = deadLettered.changes === 1;
          if (claimedTerminalTransition) {
            sqlite
              .prepare(
                `UPDATE job SET status = 'failed', completed_at = ?, terminal_reason = ? WHERE id = ?`,
              )
              .run(nowIso, 'worker_launch_exhausted', candidate.jobId);
            releaseOperation(sqlite, candidate.jobId);
          }
          sqlite.exec('COMMIT');
        } catch (terminalError) {
          sqlite.exec('ROLLBACK');
          throw terminalError;
        }
        if (claimedTerminalTransition) result.deadLettered += 1;
      } else {
        const nextAt = new Date(
          now.getTime() + LAUNCH_RETRY_DELAYS_MS[nextAttempt - 1],
        ).toISOString();
        const retried = sqlite
          .prepare(
            `UPDATE dispatch_intent
             SET status = 'pending', attempt_count = ?, next_attempt_at = ?,
                 dispatch_claim_token = NULL, dispatch_claimed_at = NULL,
                 dispatch_claim_expires_at = NULL, updated_at = ?
             WHERE id = ? AND status = 'dispatching' AND dispatch_claim_token = ?`,
          )
          .run(nextAttempt, nextAt, nowIso, candidate.id, claimToken);
        if (retried.changes === 1) result.retried += 1;
      }
    }
  }
  return result;
}
