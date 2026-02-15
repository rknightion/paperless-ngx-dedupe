import { test, expect } from '../fixtures/test-app';

test.describe('Config API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/config returns config data', async ({ request }) => {
    const response = await request.get('/api/v1/config');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data).toBe('object');

    // Seed inserts these keys
    expect(body.data['paperless.url']).toBe('http://localhost:18923');
    expect(body.data['paperless.apiToken']).toBe('test-token-e2e');
  });

  test('PUT /api/v1/config updates single config key', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: { key: 'test.setting', value: 'hello-world' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data['test.setting']).toBe('hello-world');

    // Verify persistence
    const getResponse = await request.get('/api/v1/config');
    const getBody = await getResponse.json();
    expect(getBody.data['test.setting']).toBe('hello-world');
  });

  test('PUT /api/v1/config updates batch config', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: {
        settings: {
          'batch.key1': 'value1',
          'batch.key2': 'value2',
        },
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data['batch.key1']).toBe('value1');
    expect(body.data['batch.key2']).toBe('value2');
  });

  test('PUT /api/v1/config rejects invalid body', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: { invalid: true },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('GET /api/v1/config/dedup returns dedup config', async ({ request }) => {
    const response = await request.get('/api/v1/config/dedup');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(typeof data.numPermutations).toBe('number');
    expect(typeof data.numBands).toBe('number');
    expect(typeof data.ngramSize).toBe('number');
    expect(typeof data.minWords).toBe('number');
    expect(typeof data.similarityThreshold).toBe('number');
    expect(typeof data.confidenceWeightJaccard).toBe('number');
    expect(typeof data.confidenceWeightFuzzy).toBe('number');
    expect(typeof data.confidenceWeightMetadata).toBe('number');
    expect(typeof data.confidenceWeightFilename).toBe('number');
    expect(typeof data.fuzzySampleSize).toBe('number');
    expect(typeof data.autoAnalyze).toBe('boolean');
  });

  test('PUT /api/v1/config/dedup updates dedup config', async ({ request }) => {
    const response = await request.put('/api/v1/config/dedup', {
      headers: { 'Content-Type': 'application/json' },
      data: { similarityThreshold: 0.8 },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.similarityThreshold).toBe(0.8);

    // Verify persistence
    const getResponse = await request.get('/api/v1/config/dedup');
    const getBody = await getResponse.json();
    expect(getBody.data.similarityThreshold).toBe(0.8);
  });

  test('PUT /api/v1/config/dedup rejects invalid Content-Type', async ({ request }) => {
    const response = await request.put('/api/v1/config/dedup', {
      headers: { 'Content-Type': 'text/plain' },
      data: '{ "similarityThreshold": 0.8 }',
    });

    // SvelteKit may return 403 for mismatched content types due to CSRF protection
    expect([400, 403]).toContain(response.status());
  });

  test('POST /api/v1/config/test-connection tests connection', async ({ request }) => {
    // The seed data has paperless.url = http://localhost:18923
    // The mock Paperless server should be running on that port
    const response = await request.post('/api/v1/config/test-connection', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        url: 'http://localhost:18923',
        token: 'test-token-e2e',
      },
    });

    // If mock server is running, expect 200 with connected: true
    // If not, expect 502
    const status = response.status();
    expect([200, 502]).toContain(status);

    const body = await response.json();
    if (status === 200) {
      expect(body.data.connected).toBe(true);
      expect(body.data).toHaveProperty('version');
      expect(body.data).toHaveProperty('documentCount');
    } else {
      expect(body.error).toBeDefined();
    }
  });
});
