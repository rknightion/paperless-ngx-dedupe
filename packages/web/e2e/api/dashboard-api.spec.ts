import { test, expect } from '../fixtures/test-app';

test.describe('Dashboard API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/dashboard returns 200 with expected shape', async ({ request }) => {
    const response = await request.get('/api/v1/dashboard');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(typeof data.totalDocuments).toBe('number');
    expect(data.totalDocuments).toBeGreaterThan(0);
    expect(typeof data.pendingGroups).toBe('number');
    expect(typeof data.storageSavingsBytes).toBe('number');
    expect(typeof data.pendingAnalysis).toBe('number');

    // Sync state fields
    expect(data).toHaveProperty('lastSyncAt');
    expect(data).toHaveProperty('lastSyncDocumentCount');
    expect(data).toHaveProperty('lastAnalysisAt');
    expect(data).toHaveProperty('totalDuplicateGroups');

    // Top correspondents array
    expect(Array.isArray(data.topCorrespondents)).toBe(true);
  });

  test('GET /api/v1/dashboard reflects seed data counts', async ({ request }) => {
    const response = await request.get('/api/v1/dashboard');

    expect(response.status()).toBe(200);
    const { data } = await response.json();

    // Seed inserts 10 documents
    expect(data.totalDocuments).toBe(10);

    // Seed creates 3 groups: 1 pending, 1 ignored, 1 deleted
    expect(data.pendingGroups).toBe(1);
  });
});
