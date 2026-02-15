import { test, expect } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';

test.describe('Duplicates API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/duplicates returns list', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test('GET /api/v1/duplicates supports pagination', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates?limit=1&offset=0');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(1);
    expect(body.meta.limit).toBe(1);
    expect(body.meta.offset).toBe(0);
  });

  test('GET /api/v1/duplicates supports filtering by min confidence', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates?minConfidence=0.9');

    expect(response.status()).toBe(200);
    const body = await response.json();
    // All returned items should have confidence >= 0.9
    for (const item of body.data) {
      expect(item.confidenceScore).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('GET /api/v1/duplicates supports filtering by status', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates?status=deleted');

    expect(response.status()).toBe(200);
    const body = await response.json();
    // All returned items should have deleted status
    for (const item of body.data) {
      expect(item.status).toBe('deleted');
    }
  });

  test('GET /api/v1/duplicates/:id returns detail', async ({ request }) => {
    const groupId = seed.groupIds[0];
    const response = await request.get(`/api/v1/duplicates/${groupId}`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(groupId);
    expect(body.data.confidenceScore).toBeDefined();
    expect(body.data.members).toBeDefined();
    expect(Array.isArray(body.data.members)).toBe(true);
  });

  test('GET /api/v1/duplicates/:id returns 404 for nonexistent', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('PUT /api/v1/duplicates/:id/status sets group status', async ({ request }) => {
    const groupId = seed.groupIds[0];
    const response = await request.put(`/api/v1/duplicates/${groupId}/status`, {
      data: { status: 'false_positive' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.groupId).toBe(groupId);
    expect(body.data.status).toBe('false_positive');

    // Verify the change persisted
    const getResponse = await request.get(`/api/v1/duplicates/${groupId}`);
    const getBody = await getResponse.json();
    expect(getBody.data.status).toBe('false_positive');
  });

  test('PUT /api/v1/duplicates/:id/status returns 404 for nonexistent', async ({ request }) => {
    const response = await request.put('/api/v1/duplicates/nonexistent-id/status', {
      data: { status: 'ignored' },
    });
    expect(response.status()).toBe(404);
  });
});
