import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  createJob,
  getJob,
  listJobs,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
  JobAlreadyRunningError,
} from '../manager.js';
import { JobType, JobStatus } from '../../types/enums.js';
import { job as jobTable } from '../../schema/sqlite/jobs.js';
import { eq } from 'drizzle-orm';

describe('Job Manager', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  describe('createJob', () => {
    it('should create a job and return an ID', () => {
      const id = createJob(db, JobType.SYNC);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should create a job with pending status', () => {
      const id = createJob(db, JobType.SYNC);
      const job = getJob(db, id);
      expect(job).not.toBeNull();
      expect(job!.status).toBe('pending');
      expect(job!.type).toBe('sync');
      expect(job!.progress).toBe(0);
    });

    it('should reject duplicate running job of same type', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id);
      const id2 = createJob(db, JobType.SYNC);
      // Set to running directly
      db.update(jobTable).set({ status: 'running' }).where(eq(jobTable.id, id2)).run();

      expect(() => createJob(db, JobType.SYNC)).toThrow(JobAlreadyRunningError);
    });

    it('should reject if pending job of same type exists', () => {
      createJob(db, JobType.SYNC);
      expect(() => createJob(db, JobType.SYNC)).toThrow(JobAlreadyRunningError);
    });

    it('should allow different types to run concurrently', () => {
      createJob(db, JobType.SYNC);
      const analysisId = createJob(db, JobType.ANALYSIS);
      expect(analysisId).toBeTruthy();
    });

    it('should allow new job after previous completed', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      const id2 = createJob(db, JobType.SYNC);
      expect(id2).toBeTruthy();
      expect(id2).not.toBe(id1);
    });

    it('should allow new job after previous failed', () => {
      const id1 = createJob(db, JobType.SYNC);
      failJob(db, id1, 'test error');
      const id2 = createJob(db, JobType.SYNC);
      expect(id2).toBeTruthy();
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', () => {
      expect(getJob(db, 'nonexistent')).toBeNull();
    });

    it('should return the job by ID', () => {
      const id = createJob(db, JobType.SYNC);
      const job = getJob(db, id);
      expect(job).not.toBeNull();
      expect(job!.id).toBe(id);
    });
  });

  describe('listJobs', () => {
    it('should return empty list when no jobs', () => {
      const jobs = listJobs(db);
      expect(jobs).toEqual([]);
    });

    it('should list all jobs ordered by createdAt desc', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      // Ensure different createdAt by manually setting an earlier timestamp
      db.update(jobTable)
        .set({ createdAt: '2024-01-01T00:00:00.000Z' })
        .where(eq(jobTable.id, id1))
        .run();
      const id2 = createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db);
      expect(jobs).toHaveLength(2);
      // Most recent first
      expect(jobs[0].id).toBe(id2);
    });

    it('should filter by type', () => {
      createJob(db, JobType.SYNC);
      const analysisId = createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db, { type: JobType.ANALYSIS });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(analysisId);
    });

    it('should filter by status', () => {
      const id1 = createJob(db, JobType.SYNC);
      completeJob(db, id1);
      createJob(db, JobType.ANALYSIS);
      const jobs = listJobs(db, { status: JobStatus.COMPLETED });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(id1);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        const id = createJob(db, JobType.SYNC);
        completeJob(db, id);
      }
      const jobs = listJobs(db, { limit: 3 });
      expect(jobs).toHaveLength(3);
    });
  });

  describe('updateJobProgress', () => {
    it('should update progress', () => {
      const id = createJob(db, JobType.SYNC);
      updateJobProgress(db, id, 0.5, 'Halfway');
      const job = getJob(db, id);
      expect(job!.progress).toBe(0.5);
      expect(job!.progressMessage).toBe('Halfway');
    });

    it('should clamp progress to [0, 1]', () => {
      const id = createJob(db, JobType.SYNC);
      updateJobProgress(db, id, 1.5);
      expect(getJob(db, id)!.progress).toBe(1);
      updateJobProgress(db, id, -0.5);
      expect(getJob(db, id)!.progress).toBe(0);
    });
  });

  describe('completeJob', () => {
    it('should set status to completed', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id, { count: 42 });
      const job = getJob(db, id);
      expect(job!.status).toBe('completed');
      expect(job!.progress).toBe(1);
      expect(job!.completedAt).toBeTruthy();
      expect(JSON.parse(job!.resultJson!)).toEqual({ count: 42 });
    });
  });

  describe('failJob', () => {
    it('should set status to failed', () => {
      const id = createJob(db, JobType.SYNC);
      failJob(db, id, 'Something went wrong');
      const job = getJob(db, id);
      expect(job!.status).toBe('failed');
      expect(job!.errorMessage).toBe('Something went wrong');
      expect(job!.completedAt).toBeTruthy();
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job', () => {
      const id = createJob(db, JobType.SYNC);
      const result = cancelJob(db, id);
      expect(result).toBe(true);
      expect(getJob(db, id)!.status).toBe('cancelled');
    });

    it('should return false for nonexistent job', () => {
      expect(cancelJob(db, 'nonexistent')).toBe(false);
    });

    it('should return false for already completed job', () => {
      const id = createJob(db, JobType.SYNC);
      completeJob(db, id);
      expect(cancelJob(db, id)).toBe(false);
    });

    it('should return false for already failed job', () => {
      const id = createJob(db, JobType.SYNC);
      failJob(db, id, 'error');
      expect(cancelJob(db, id)).toBe(false);
    });

    it('should return false for already cancelled job', () => {
      const id = createJob(db, JobType.SYNC);
      cancelJob(db, id);
      expect(cancelJob(db, id)).toBe(false);
    });
  });
});
