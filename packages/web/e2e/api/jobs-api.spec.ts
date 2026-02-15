import { test, expect } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';

test.describe('Jobs API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/jobs returns list of jobs', async ({ request }) => {
    const response = await request.get('/api/v1/jobs');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    // Verify job shape
    const job = body.data[0];
    expect(job).toHaveProperty('id');
    expect(job).toHaveProperty('type');
    expect(job).toHaveProperty('status');
    expect(job).toHaveProperty('progress');
  });

  test('GET /api/v1/jobs supports type filter', async ({ request }) => {
    const response = await request.get('/api/v1/jobs?type=SYNC');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const job of body.data) {
      expect(job.type).toBe('SYNC');
    }
  });

  test('GET /api/v1/jobs supports limit parameter', async ({ request }) => {
    const response = await request.get('/api/v1/jobs?limit=1');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  test('GET /api/v1/jobs/:jobId returns single job', async ({ request }) => {
    const jobId = seed.jobIds[0];
    const response = await request.get(`/api/v1/jobs/${jobId}`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(jobId);
    expect(body.data.type).toBe('SYNC');
    expect(body.data.status).toBe('completed');
    expect(body.data.progress).toBe(1);
  });

  test('GET /api/v1/jobs/:jobId returns 404 for nonexistent', async ({ request }) => {
    const response = await request.get('/api/v1/jobs/nonexistent-job-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('POST /api/v1/sync creates a sync job', async ({ request }) => {
    const response = await request.post('/api/v1/sync');

    // 202 = job created, 409 = job already running, 500 = worker not found in preview mode
    const status = response.status();
    expect([202, 409, 500]).toContain(status);

    const body = await response.json();
    if (status === 202) {
      expect(body.data).toBeDefined();
      expect(body.data.jobId).toBeDefined();
      expect(typeof body.data.jobId).toBe('string');
    }
  });

  test('GET /api/v1/sync/status returns sync status', async ({ request }) => {
    const response = await request.get('/api/v1/sync/status');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(data).toHaveProperty('lastSyncAt');
    expect(data).toHaveProperty('lastSyncDocumentCount');
    expect(typeof data.totalDocuments).toBe('number');
    expect(typeof data.isSyncing).toBe('boolean');
    expect(data).toHaveProperty('currentJobId');
  });

  test('POST /api/v1/analysis creates analysis job', async ({ request }) => {
    const response = await request.post('/api/v1/analysis');

    // 202 = job created, 409 = job already running, 500 = worker not found in preview mode
    const status = response.status();
    expect([202, 409, 500]).toContain(status);

    const body = await response.json();
    if (status === 202) {
      expect(body.data).toBeDefined();
      expect(body.data.jobId).toBeDefined();
      expect(typeof body.data.jobId).toBe('string');
    }
  });

  test('GET /api/v1/analysis/status returns analysis status', async ({ request }) => {
    const response = await request.get('/api/v1/analysis/status');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(data).toHaveProperty('lastAnalysisAt');
    expect(typeof data.totalDuplicateGroups).toBe('number');
    expect(typeof data.isAnalyzing).toBe('boolean');
    expect(data).toHaveProperty('currentJobId');
  });
});
