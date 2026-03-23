import { test, expect } from '../fixtures/test-app';

test.describe('RAG API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  // Note: RAG_ENABLED defaults to false in E2E config, so all RAG endpoints
  // return 404 with "Document Q&A is not enabled". These tests verify that
  // the endpoints exist and return the correct disabled-state response.

  // ── Config ──────────────────────────────────────────────────────────

  test('GET /api/v1/rag/config returns 404 when RAG is disabled', async ({ request }) => {
    const response = await request.get('/api/v1/rag/config');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('PUT /api/v1/rag/config returns 404 when RAG is disabled', async ({ request }) => {
    const response = await request.put('/api/v1/rag/config', {
      headers: { 'Content-Type': 'application/json' },
      data: { embeddingModel: 'text-embedding-3-small', chunkSize: 512 },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ── Stats ───────────────────────────────────────────────────────────

  test('GET /api/v1/rag/stats returns 404 when RAG is disabled', async ({ request }) => {
    const response = await request.get('/api/v1/rag/stats');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ── Conversations ───────────────────────────────────────────────────

  test('GET /api/v1/rag/conversations returns 404 when RAG is disabled', async ({ request }) => {
    const response = await request.get('/api/v1/rag/conversations');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/v1/rag/conversations/:id returns 404 when RAG is disabled', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/rag/conversations/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('DELETE /api/v1/rag/conversations/:id returns 404 when RAG is disabled', async ({
    request,
  }) => {
    const response = await request.delete('/api/v1/rag/conversations/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
