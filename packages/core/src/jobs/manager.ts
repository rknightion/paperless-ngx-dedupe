import { eq, and, or, desc, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';

import type { AppDatabase } from '../db/client.js';
import { job } from '../schema/sqlite/jobs.js';
import {
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
} from '../schema/sqlite/automation.js';
import type { Job } from '../schema/types.js';
import type { JobType, JobStatus } from '../types/enums.js';
import { jobsTotal } from '../telemetry/metrics.js';
import {
  acquireOperation,
  enqueueManualOperation,
  OperationConflictError,
} from '../scheduler/coordinator.js';
import type { OperationKind } from '../scheduler/store.js';
import { document } from '../schema/sqlite/documents.js';

export class JobAlreadyRunningError extends Error {
  constructor(type: string) {
    super(`A job of type '${type}' is already running or pending`);
    this.name = 'JobAlreadyRunningError';
  }
}

export interface JobFilters {
  type?: JobType;
  status?: JobStatus;
  limit?: number;
}

export type LegacyJob = Omit<Job, 'publicHistoryKey'>;

export interface JobHistoryQuery {
  type?: JobType;
  status?: JobStatus;
  limit?: number;
  cursor?: string;
}

export interface JobHistoryPage {
  items: JobHistoryItem[];
  nextCursor: string | null;
}

export interface JobHistoryItem {
  key: string;
  type: string;
  status: string | null;
  progress: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const JOB_TYPES: readonly JobType[] = [
  'sync',
  'analysis',
  'batch_operation',
  'ai_processing',
  'ai_apply',
  'ai_revert',
  'custom_field_discovery',
];
const JOB_STATUSES: readonly JobStatus[] = [
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
];
interface JobHistoryCursor {
  key: string;
}

export class JobHistoryQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobHistoryQueryError';
  }
}

function encodeJobHistoryCursor(value: JobHistoryCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJobHistoryCursor(cursor: string): JobHistoryCursor {
  try {
    if (!cursor || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error('invalid encoding');
    }
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new Error('non-canonical encoding');
    const value = JSON.parse(decoded.toString('utf8')) as unknown;
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).join(',') !== 'key'
    ) {
      throw new Error('invalid shape');
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.key !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(candidate.key)) {
      throw new Error('invalid values');
    }
    return { key: candidate.key };
  } catch {
    throw new JobHistoryQueryError('cursor is invalid');
  }
}

const AUTOMATED_RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

const OPERATION_BY_JOB_TYPE: Record<JobType, OperationKind> = {
  sync: 'sync',
  analysis: 'analysis',
  batch_operation: 'duplicate_delete',
  ai_processing: 'ai_processing',
  ai_apply: 'ai_apply',
  ai_revert: 'ai_revert',
  custom_field_discovery: 'custom_field_discovery',
};

function sqliteFor(db: AppDatabase): Database.Database {
  const sqlite = (db as unknown as { $client?: Database.Database }).$client;
  if (!sqlite) throw new Error('AppDatabase does not expose its SQLite client');
  return sqlite;
}

function classifyAutomatedFailure(error: string): 'transient' | 'non_retryable' {
  if (/(?:\b429\b|\b5\d\d\b|network|timeout|timed out|econn|enotfound|socket)/i.test(error)) {
    return 'transient';
  }
  return 'non_retryable';
}

function changedSyncResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const values = result as { changed?: unknown; inserted?: unknown; updated?: unknown };
  return values.changed === true || Number(values.inserted ?? 0) + Number(values.updated ?? 0) > 0;
}

export function createJob(db: AppDatabase, type: JobType, taskData?: unknown): string {
  try {
    const intent = enqueueManualOperation(
      sqliteFor(db),
      OPERATION_BY_JOB_TYPE[type],
      { kind: 'manual' },
      type,
      taskData,
    );
    if (!intent.jobId) throw new Error('Manual dispatch intent did not create a job');
    return intent.jobId;
  } catch (error) {
    if (error instanceof OperationConflictError) {
      throw new JobAlreadyRunningError(type);
    }
    throw error;
  }
}

function toLegacyJob(row: Job): LegacyJob {
  const legacy = { ...row };
  delete (legacy as Partial<Job>).publicHistoryKey;
  return legacy;
}

export function getJob(db: AppDatabase, id: string): LegacyJob | null {
  const result = db.select().from(job).where(eq(job.id, id)).get();

  return result ? toLegacyJob(result) : null;
}

export function listJobs(db: AppDatabase, filters?: JobFilters): LegacyJob[] {
  const conditions = [];

  if (filters?.type) {
    conditions.push(eq(job.type, filters.type));
  }
  if (filters?.status) {
    conditions.push(eq(job.status, filters.status));
  }

  const limit = filters?.limit ?? 50;

  return db
    .select()
    .from(job)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(job.createdAt))
    .limit(limit)
    .all()
    .map(toLegacyJob);
}

export function listJobHistory(db: AppDatabase, query: JobHistoryQuery = {}): JobHistoryPage {
  if (query.type !== undefined && !JOB_TYPES.includes(query.type)) {
    throw new JobHistoryQueryError(`type must be one of: ${JOB_TYPES.join(', ')}`);
  }
  if (query.status !== undefined && !JOB_STATUSES.includes(query.status)) {
    throw new JobHistoryQueryError(`status must be one of: ${JOB_STATUSES.join(', ')}`);
  }
  const limit = query.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new JobHistoryQueryError('limit must be between 1 and 100');
  }

  const conditions = [];
  if (query.type) conditions.push(eq(job.type, query.type));
  if (query.status) conditions.push(eq(job.status, query.status));
  if (query.cursor !== undefined) {
    const cursor = decodeJobHistoryCursor(query.cursor);
    const boundary = sqliteFor(db)
      .prepare(
        `SELECT id, created_at AS createdAt
         FROM job INDEXED BY job_public_history_key_unique
         WHERE public_history_key = ?`,
      )
      .get(cursor.key) as { id: string; createdAt: string } | undefined;
    if (!boundary) throw new JobHistoryQueryError('cursor is invalid');
    conditions.push(
      or(
        lt(job.createdAt, boundary.createdAt),
        and(eq(job.createdAt, boundary.createdAt), lt(job.id, boundary.id)),
      )!,
    );
  }

  const rows = db
    .select({
      id: job.id,
      publicHistoryKey: job.publicHistoryKey,
      type: job.type,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
    })
    .from(job)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(job.createdAt), desc(job.id))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  if (pageRows.some(({ publicHistoryKey }) => !publicHistoryKey)) {
    throw new Error('Job history public key invariant is not satisfied');
  }
  const items = pageRows.map(({ id: _id, publicHistoryKey, ...row }) => ({
    key: publicHistoryKey!,
    ...row,
  }));
  return {
    items,
    nextCursor:
      hasMore && last?.publicHistoryKey
        ? encodeJobHistoryCursor({ key: last.publicHistoryKey })
        : null,
  };
}

const CLEARABLE_JOB_WHERE = `
  j.status IN ('completed', 'failed', 'cancelled')
  AND NOT (
    j.status = 'failed'
    AND (
      j.terminal_reason IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM dispatch_intent dead_letter
        WHERE dead_letter.job_id = j.id AND dead_letter.status = 'dead_letter'
      )
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM reviewed_mutation_plan plan
    WHERE plan.claimed_by_job_id = j.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_intent child_intent
    WHERE child_intent.parent_job_id = j.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM sync_change_generation generation
    WHERE generation.sync_job_id = j.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM operation_lease lease
    WHERE lease.owner_id = j.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM dispatch_intent budget_intent
    INNER JOIN ai_budget_reservation budget
      ON budget.dispatch_intent_id = budget_intent.id
    WHERE budget_intent.job_id = j.id
  )
`;

export function getJobHistoryCounts(db: AppDatabase): { clearable: number } {
  const result = sqliteFor(db)
    .prepare(`SELECT COUNT(*) AS clearable FROM job j WHERE ${CLEARABLE_JOB_WHERE}`)
    .get() as { clearable: number };
  return result;
}

export function updateJobProgress(
  db: AppDatabase,
  id: string,
  progress: number,
  message?: string,
  phaseProgress?: number,
  executionToken?: string,
): void {
  const clamped = Math.max(0, Math.min(1, progress));

  const updated = db
    .update(job)
    .set({
      progress: clamped,
      phaseProgress: phaseProgress != null ? Math.max(0, Math.min(1, phaseProgress)) : null,
      progressMessage: message,
    })
    .where(
      executionToken
        ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
        : eq(job.id, id),
    )
    .run();
  if (executionToken && updated.changes !== 1) return;
  db.update(operationLease)
    .set({ heartbeatAt: new Date().toISOString() })
    .where(eq(operationLease.ownerId, id))
    .run();
}

export function completeJob(
  db: AppDatabase,
  id: string,
  result?: unknown,
  executionToken?: string,
): void {
  const now = new Date().toISOString();
  let type: string | null = null;
  let transitioned = false;
  db.transaction((tx) => {
    const existing = tx
      .select({
        type: job.type,
        triggerKind: job.triggerKind,
        scheduleId: job.scheduleId,
        dueAt: job.dueAt,
        rootScheduleId: job.rootScheduleId,
        rootDueAt: job.rootDueAt,
      })
      .from(job)
      .where(
        executionToken
          ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
          : eq(job.id, id),
      )
      .get();
    if (!existing) return;
    type = existing?.type ?? null;
    const completed = tx
      .update(job)
      .set({
        status: 'completed',
        progress: 1,
        completedAt: now,
        executionToken: null,
        resultJson: result !== undefined ? JSON.stringify(result) : undefined,
      })
      .where(
        executionToken
          ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
          : eq(job.id, id),
      )
      .run();
    if (executionToken && completed.changes !== 1) return;
    transitioned = completed.changes === 1;
    if (
      existing?.type === 'sync' &&
      existing.triggerKind === 'schedule' &&
      existing.scheduleId &&
      existing.dueAt
    ) {
      const syncResult =
        result && typeof result === 'object' ? (result as { failed?: unknown }) : {};
      const partialFailure = Number(syncResult.failed ?? 0) > 0;
      const existingGeneration = tx
        .select({ id: syncChangeGeneration.id })
        .from(syncChangeGeneration)
        .where(eq(syncChangeGeneration.syncJobId, id))
        .get();
      const changed = existingGeneration
        ? (tx
            .select({ count: sql<number>`count(*)` })
            .from(document)
            .where(eq(document.lastChangedBySyncGenerationId, existingGeneration.id))
            .get()?.count ?? 0) > 0
        : changedSyncResult(result);
      const status = partialFailure ? 'partial_failed' : changed ? 'ready' : 'no_change';
      tx.insert(syncChangeGeneration)
        .values({
          id: existingGeneration?.id ?? nanoid(),
          syncJobId: id,
          rootScheduleId: existing.rootScheduleId ?? existing.scheduleId,
          rootDueAt: existing.rootDueAt ?? existing.dueAt,
          status,
          createdAt: now,
          changedAt: changed ? now : null,
          completedAt: now,
        })
        .onConflictDoUpdate({
          target: syncChangeGeneration.syncJobId,
          set: {
            status,
            changedAt: changed ? now : null,
            completedAt: now,
          },
        })
        .run();
    }
    tx.delete(operationLease).where(eq(operationLease.ownerId, id)).run();
  });
  if (transitioned && type) jobsTotal().add(1, { type, outcome: 'completed' });
}

export function failJob(db: AppDatabase, id: string, error: string, executionToken?: string): void {
  const existing = db
    .select({ type: job.type, attempt: job.attempt })
    .from(job)
    .where(
      executionToken
        ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
        : eq(job.id, id),
    )
    .get();
  if (!existing) return;
  const now = new Date();
  const nowIso = now.toISOString();
  const attempt = existing?.attempt ?? 0;
  const retryable = classifyAutomatedFailure(error) === 'transient';

  if (existing && retryable && attempt < AUTOMATED_RETRY_DELAYS_MS.length) {
    const nextAttempt = attempt + 1;
    const nextAttemptAt = new Date(
      now.getTime() + AUTOMATED_RETRY_DELAYS_MS[nextAttempt - 1],
    ).toISOString();
    let transitioned = false;
    db.transaction((tx) => {
      const requeued = tx
        .update(job)
        .set({
          status: 'pending',
          errorMessage: error,
          completedAt: null,
          startedAt: null,
          executionToken: null,
          attempt: nextAttempt,
          nextAttemptAt,
          terminalReason: null,
        })
        .where(
          executionToken
            ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
            : eq(job.id, id),
        )
        .run();
      if (executionToken && requeued.changes !== 1) return;
      transitioned = requeued.changes === 1;
      tx.update(dispatchIntent)
        .set({
          status: 'pending',
          nextAttemptAt,
          terminalReason: null,
          updatedAt: nowIso,
        })
        .where(eq(dispatchIntent.jobId, id))
        .run();
    });
    if (!transitioned) return;
    return;
  }

  const terminalReason = retryable ? 'automated_retry_exhausted' : 'automated_retry_not_allowed';
  let transitioned = false;
  db.transaction((tx) => {
    const failed = tx
      .update(job)
      .set({
        status: 'failed',
        errorMessage: error,
        completedAt: nowIso,
        executionToken: null,
        terminalReason,
      })
      .where(
        executionToken
          ? and(eq(job.id, id), eq(job.status, 'running'), eq(job.executionToken, executionToken))
          : eq(job.id, id),
      )
      .run();
    if (executionToken && failed.changes !== 1) return;
    transitioned = failed.changes === 1;
    if (!transitioned) return;
    tx.update(dispatchIntent)
      .set({
        status: 'dead_letter',
        terminalReason,
        nextAttemptAt: null,
        updatedAt: nowIso,
      })
      .where(eq(dispatchIntent.jobId, id))
      .run();
    if (existing.type === 'sync') {
      tx.update(syncChangeGeneration)
        .set({ status: 'failed', completedAt: nowIso })
        .where(eq(syncChangeGeneration.syncJobId, id))
        .run();
    }
    tx.delete(operationLease).where(eq(operationLease.ownerId, id)).run();
  });
  if (transitioned && existing?.type) {
    jobsTotal().add(1, { type: existing.type, outcome: 'failed' });
  }
}

/** Requeues an exhausted job only after an explicit manual retry request. */
export function retryDeadLetterJob(db: AppDatabase, id: string): boolean {
  const sqlite = sqliteFor(db);
  const existing = sqlite
    .prepare('SELECT type, status, terminal_reason AS terminalReason FROM job WHERE id = ?')
    .get(id) as { type: JobType; status: string | null; terminalReason: string | null } | undefined;
  if (!existing || existing.status !== 'failed' || !existing.terminalReason) return false;

  const nowIso = new Date().toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    acquireOperation(sqlite, OPERATION_BY_JOB_TYPE[existing.type], id);
    sqlite
      .prepare(
        `UPDATE job
         SET status = 'pending', error_message = NULL, completed_at = NULL, attempt = 0,
             started_at = NULL, execution_token = NULL, next_attempt_at = NULL,
             terminal_reason = NULL
         WHERE id = ? AND status = 'failed'`,
      )
      .run(id);
    sqlite
      .prepare(
        `UPDATE dispatch_intent
         SET status = 'pending', attempt_count = 0, next_attempt_at = NULL,
             terminal_reason = NULL, dispatch_claim_token = NULL, dispatch_claimed_at = NULL,
             dispatch_claim_expires_at = NULL, updated_at = ?
         WHERE job_id = ? AND status = 'dead_letter'`,
      )
      .run(nowIso, id);
    sqlite.exec('COMMIT');
    return true;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    if (error instanceof OperationConflictError) return false;
    throw error;
  }
}

export function recoverStaleJobs(db: AppDatabase): number {
  const sqlite = sqliteFor(db);
  const stale = sqlite
    .prepare(
      `SELECT j.id, j.type, j.status AS job_status
       FROM job j
       LEFT JOIN dispatch_intent i ON i.job_id = j.id
       WHERE j.status IN ('running', 'paused')
          OR (j.status = 'pending' AND i.status = 'dispatched')`,
    )
    .all() as { id: string; type: JobType; job_status: string }[];
  if (stale.length === 0) return 0;

  const now = new Date().toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const { id, type, job_status: jobStatus } of stale) {
      const lease = sqlite.prepare('SELECT id FROM operation_lease WHERE owner_id = ?').get(id);
      if (!lease) acquireOperation(sqlite, OPERATION_BY_JOB_TYPE[type], id);
      if (jobStatus === 'running' || jobStatus === 'paused') {
        sqlite
          .prepare(
            `UPDATE job
             SET status = 'pending', error_message = ?, completed_at = NULL,
                 started_at = NULL, execution_token = NULL, next_attempt_at = ?,
                 terminal_reason = ?
             WHERE id = ?`,
          )
          .run('Job interrupted by application restart', now, 'restart_interrupted', id);
      }
      sqlite
        .prepare(
          `UPDATE dispatch_intent
           SET status = 'pending', next_attempt_at = ?, dispatch_claim_token = NULL,
               dispatch_claimed_at = NULL, dispatch_claim_expires_at = NULL, updated_at = ?
           WHERE job_id = ?`,
        )
        .run(now, now, id);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  return stale.length;
}

export function clearJobHistory(db: AppDatabase): number {
  const sqlite = sqliteFor(db);
  return sqlite.transaction(() => {
    sqlite.exec(`
      DROP TABLE IF EXISTS temp.clearable_job_history;
      CREATE TEMP TABLE clearable_job_history (id TEXT PRIMARY KEY);
      INSERT INTO clearable_job_history (id)
      SELECT j.id FROM job j WHERE ${CLEARABLE_JOB_WHERE};
      DELETE FROM dispatch_intent
      WHERE job_id IN (SELECT id FROM clearable_job_history);
    `);
    const result = sqlite
      .prepare('DELETE FROM job WHERE id IN (SELECT id FROM clearable_job_history)')
      .run();
    sqlite.exec('DROP TABLE clearable_job_history');
    return result.changes;
  })();
}

export function pauseJob(db: AppDatabase, id: string): boolean {
  const existing = db.select({ status: job.status }).from(job).where(eq(job.id, id)).get();

  if (!existing || existing.status !== 'running') {
    return false;
  }

  db.update(job).set({ status: 'paused' }).where(eq(job.id, id)).run();

  return true;
}

export function resumeJob(db: AppDatabase, id: string): boolean {
  const existing = db.select({ status: job.status }).from(job).where(eq(job.id, id)).get();

  if (!existing || existing.status !== 'paused') {
    return false;
  }

  db.update(job).set({ status: 'running' }).where(eq(job.id, id)).run();

  return true;
}

export function cancelJob(db: AppDatabase, id: string): boolean {
  const existing = db.select({ status: job.status }).from(job).where(eq(job.id, id)).get();

  if (!existing) {
    return false;
  }

  const terminalStates: string[] = ['completed', 'failed', 'cancelled'];
  if (terminalStates.includes(existing.status!)) {
    return false;
  }

  const jobRow = db.select({ type: job.type }).from(job).where(eq(job.id, id)).get();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(job)
      .set({
        status: 'cancelled',
        completedAt: now,
        executionToken: null,
      })
      .where(eq(job.id, id))
      .run();
    tx.update(dispatchIntent)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(dispatchIntent.jobId, id))
      .run();
    tx.delete(operationLease).where(eq(operationLease.ownerId, id)).run();
  });
  if (jobRow?.type) jobsTotal().add(1, { type: jobRow.type, outcome: 'cancelled' });

  return true;
}
