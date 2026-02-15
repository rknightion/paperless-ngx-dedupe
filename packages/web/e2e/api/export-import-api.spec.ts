import { test, expect } from '../fixtures/test-app';

test.describe('Export/Import API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/export/duplicates.csv returns CSV with correct headers', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/export/duplicates.csv');

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/csv');

    const contentDisposition = response.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('duplicates-');
    expect(contentDisposition).toContain('.csv');

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);

    // Check CSV header row (skip BOM character)
    const lines = text.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toContain('group_id');
    expect(lines[0]).toContain('confidence_score');
    expect(lines[0]).toContain('title');
    expect(lines[0]).toContain('paperless_id');

    // Should have data rows (seed has 3 groups with members)
    expect(lines.length).toBeGreaterThan(1);
  });

  test('GET /api/v1/export/duplicates.csv supports status filter', async ({ request }) => {
    const response = await request.get('/api/v1/export/duplicates.csv?status=pending');

    expect(response.status()).toBe(200);
    const text = await response.text();
    const lines = text.replace('\uFEFF', '').split('\r\n').filter(Boolean);

    // Header + rows for the pending group only
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/v1/export/config.json returns JSON config', async ({ request }) => {
    const response = await request.get('/api/v1/export/config.json');

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');

    const contentDisposition = response.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('paperless-dedupe-config-');
    expect(contentDisposition).toContain('.json');

    const body = await response.json();
    expect(body.version).toBeDefined();
    expect(body.version).toMatch(/^1\./);
    expect(body.exportedAt).toBeDefined();
    expect(typeof body.appConfig).toBe('object');
    expect(typeof body.dedupConfig).toBe('object');

    // Verify app config contains seeded values
    expect(body.appConfig['paperless.url']).toBe('http://localhost:18923');

    // Verify dedup config shape
    expect(typeof body.dedupConfig.numPermutations).toBe('number');
    expect(typeof body.dedupConfig.similarityThreshold).toBe('number');
  });

  test('POST /api/v1/import/config imports config', async ({ request }) => {
    // First export to get a valid config
    const exportResponse = await request.get('/api/v1/export/config.json');
    const exportedConfig = await exportResponse.json();

    // Modify a setting
    exportedConfig.appConfig['paperless.url'] = 'http://new-server:8000';

    // Import the modified config
    const importResponse = await request.post('/api/v1/import/config', {
      data: exportedConfig,
    });

    expect(importResponse.status()).toBe(200);
    const body = await importResponse.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.appConfigKeys).toBe('number');
    expect(body.data.appConfigKeys).toBeGreaterThan(0);
    expect(body.data.dedupConfigUpdated).toBe(true);

    // Verify the imported config persisted
    const configResponse = await request.get('/api/v1/config');
    const configBody = await configResponse.json();
    expect(configBody.data['paperless.url']).toBe('http://new-server:8000');
  });

  test('POST /api/v1/import/config rejects invalid body', async ({ request }) => {
    const response = await request.post('/api/v1/import/config', {
      data: { invalid: 'data' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/import/config rejects invalid JSON', async ({ request }) => {
    const response = await request.post('/api/v1/import/config', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not valid json{{{',
    });

    // Should return 400 for invalid JSON
    expect(response.status()).toBe(400);
  });
});
