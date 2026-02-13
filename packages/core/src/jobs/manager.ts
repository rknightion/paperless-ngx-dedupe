import { eq, and, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { AppDatabase } from '../db/client.js';
import { job } from '../schema/sqlite/jobs.js';
import type { Job } from '../schema/types.js';
import type { JobType, JobStatus } from '../types/enums.js';

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

export function createJob(db: AppDatabase, type: JobType): string {
  // Check for existing running or pending job of the same type
  const existing = db
    .select({ id: job.id })
    .from(job)
    .where(
      and(
        eq(job.type, type),
        or(eq(job.status, 'running'), eq(job.status, 'pending'))
      )
    )
    .get();

  if (existing) {
    throw new JobAlreadyRunningError(type);
  }

  const id = nanoid();
  db.insert(job)
    .values({
      id,
      type,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    })
    .run();

  return id;
}

export function getJob(db: AppDatabase, id: string): Job | null {
  const result = db
    .select()
    .from(job)
    .where(eq(job.id, id))
    .get();

  return result ?? null;
}

export function listJobs(db: AppDatabase, filters?: JobFilters): Job[] {
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
    .all();
}

export function updateJobProgress(
  db: AppDatabase,
  id: string,
  progress: number,
  message?: string
): void {
  const clamped = Math.max(0, Math.min(1, progress));

  db.update(job)
    .set({
      progress: clamped,
      progressMessage: message,
    })
    .where(eq(job.id, id))
    .run();
}

export function completeJob(
  db: AppDatabase,
  id: string,
  result?: unknown
): void {
  db.update(job)
    .set({
      status: 'completed',
      progress: 1,
      completedAt: new Date().toISOString(),
      resultJson: result !== undefined ? JSON.stringify(result) : undefined,
    })
    .where(eq(job.id, id))
    .run();
}

export function failJob(
  db: AppDatabase,
  id: string,
  error: string
): void {
  db.update(job)
    .set({
      status: 'failed',
      errorMessage: error,
      completedAt: new Date().toISOString(),
    })
    .where(eq(job.id, id))
    .run();
}

export function cancelJob(db: AppDatabase, id: string): boolean {
  const existing = db
    .select({ status: job.status })
    .from(job)
    .where(eq(job.id, id))
    .get();

  if (!existing) {
    return false;
  }

  const terminalStates: string[] = ['completed', 'failed', 'cancelled'];
  if (terminalStates.includes(existing.status!)) {
    return false;
  }

  db.update(job)
    .set({
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    })
    .where(eq(job.id, id))
    .run();

  return true;
}
