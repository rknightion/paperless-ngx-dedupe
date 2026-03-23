import { test, expect } from '../fixtures/test-app';

test.describe('AI API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
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

  test('GET /api/v1/ai/models?provider=anthropic returns anthropic models', async ({ request }) => {
    const response = await request.get('/api/v1/ai/models?provider=anthropic');

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

  // ── Config (requires AI_ENABLED) ────────────────────────────────────

  test('GET /api/v1/ai/config returns 400 when AI is disabled', async ({ request }) => {
    const response = await request.get('/api/v1/ai/config');

    // AI_ENABLED is false in E2E config, so this should fail
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('PUT /api/v1/ai/config returns 400 when AI is disabled', async ({ request }) => {
    const response = await request.put('/api/v1/ai/config', {
      headers: { 'Content-Type': 'application/json' },
      data: { provider: 'openai', model: 'gpt-4o' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  // ── Process (requires AI_ENABLED) ───────────────────────────────────

  test('POST /api/v1/ai/process returns 400 when AI is disabled', async ({ request }) => {
    const response = await request.post('/api/v1/ai/process', {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
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

  test('POST /api/v1/ai/results/batch-apply returns 400 when AI is disabled', async ({
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
