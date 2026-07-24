import { test, expect } from '../fixtures/test-app';
import { DB_PATH } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';
import Database from 'better-sqlite3';

test.describe('AI API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  // ── Stats (no AI_ENABLED check) ─────────────────────────────────────

  test('GET /api/v1/ai/stats returns stats', async ({ request }) => {
    const response = await request.get('/api/v1/ai/stats');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.totalProcessed).toBe('number');
    expect(typeof body.data.pendingReview).toBe('number');
    expect(typeof body.data.applied).toBe('number');
    expect(typeof body.data.rejected).toBe('number');
    expect(typeof body.data.failed).toBe('number');
    expect(typeof body.data.totalPromptTokens).toBe('number');
    expect(typeof body.data.totalCompletionTokens).toBe('number');
  });

  // ── Models (no AI_ENABLED check) ────────────────────────────────────

  test('GET /api/v1/ai/models returns model list for openai', async ({ request }) => {
    const response = await request.get('/api/v1/ai/models');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  // ── Results (no AI_ENABLED check) ───────────────────────────────────

  test('GET /api/v1/ai/results returns paginated results', async ({ request }) => {
    const response = await request.get('/api/v1/ai/results');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.limit).toBe('number');
    expect(typeof body.meta.offset).toBe('number');
  });

  test('GET /api/v1/ai/results/:id returns 404 for non-existent ID', async ({ request }) => {
    const response = await request.get('/api/v1/ai/results/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ── Config ──────────────────────────────────────────────────────────

  test('GET /api/v1/ai/config returns config when AI is enabled', async ({ request }) => {
    const response = await request.get('/api/v1/ai/config');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.provider).toBe('openai');
  });

  test('PUT /api/v1/ai/config updates config when AI is enabled', async ({ request }) => {
    const response = await request.put('/api/v1/ai/config', {
      headers: { 'Content-Type': 'application/json' },
      data: { applyConcurrency: 3 },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.applyConcurrency).toBe(3);
  });

  // ── Batch operations ────────────────────────────────────────────────

  test('POST /api/v1/ai/results/batch-reject returns 400 with empty resultIds', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/ai/results/batch-reject', {
      headers: { 'Content-Type': 'application/json' },
      data: { resultIds: [] },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/v1/ai/results/batch-apply requires a reviewed plan token', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/ai/results/batch-apply', {
      headers: { 'Content-Type': 'application/json' },
      data: { resultIds: ['r-1'] },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('creates a reviewed apply plan and executes it through the production worker', async ({
    request,
  }) => {
    const resultId = 'e2e-reviewed-ai-result';
    const sqlite = new Database(DB_PATH);
    sqlite
      .prepare(
        `INSERT INTO ai_processing_result (
           id, document_id, paperless_id, provider, model, suggested_title,
           current_title, applied_status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        resultId,
        seed.documentIds[0],
        1,
        'openai',
        'e2e-model',
        'AI reviewed E2E title',
        'Test Document 1',
        'pending_review',
        new Date().toISOString(),
      );
    sqlite.close();

    const preflightResponse = await request.post('/api/v1/ai/results/preflight', {
      data: {
        scope: { type: 'selected_result_ids', resultIds: [resultId] },
        selection: {
          title: true,
          correspondent: false,
          documentType: false,
          tags: false,
          processedTag: false,
          customFieldIds: [],
        },
      },
    });
    expect(preflightResponse.status()).toBe(200);
    const preflight = await preflightResponse.json();
    expect(preflight.data.resultIds).toEqual([resultId]);

    const applyResponse = await request.post('/api/v1/ai/results/batch-apply', {
      data: { planToken: preflight.data.token },
    });
    expect(applyResponse.status()).toBe(202);
    const apply = await applyResponse.json();

    await expect
      .poll(async () => {
        const jobs = await request.get('/api/v1/jobs?limit=200');
        const jobsBody = await jobs.json();
        return jobsBody.data.find((job: { id: string }) => job.id === apply.data.jobId)?.status;
      })
      .toBe('completed');

    const paperlessResponse = await fetch('http://localhost:18923/api/documents/1/', {
      headers: { Authorization: 'Token test-token-e2e' },
    });
    expect(paperlessResponse.status).toBe(200);
    const paperlessDocument = (await paperlessResponse.json()) as { title: string };
    expect(paperlessDocument.title).toBe('AI reviewed E2E title');

    const resultResponse = await request.get(`/api/v1/ai/results/${resultId}`);
    expect(resultResponse.status()).toBe(200);
    const result = await resultResponse.json();
    expect(result.data.appliedStatus).toBe('partial');
  });

  // ── Single result reject (no AI_ENABLED check) ──────────────────────

  test('POST /api/v1/ai/results/:id/reject returns success even for non-existent', async ({
    request,
  }) => {
    // The reject endpoint doesn't check AI_ENABLED and doesn't validate existence
    const response = await request.post('/api/v1/ai/results/nonexistent-id/reject');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.rejected).toBe(true);
  });
});
