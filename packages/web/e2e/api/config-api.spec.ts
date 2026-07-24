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

    // Stale environment-owned connection data is never exposed to API clients.
    expect(body.data['paperless.url']).toBeUndefined();
    expect(body.data['paperless.apiToken']).toBeUndefined();
  });

  test('PUT /api/v1/config rejects credential values without partial writes', async ({
    request,
  }) => {
    const secret = 'paperless-secret-that-must-not-return';
    const response = await request.put('/api/v1/config', {
      data: {
        settings: {
          'paperless.apiToken': secret,
          'openai.apiKey': 'sk-secret-that-must-not-return',
          'ai.model': 'must-not-persist',
        },
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    const getBody = await (await request.get('/api/v1/config')).json();
    expect(getBody.data).not.toHaveProperty('ai.model');
  });

  test('PUT /api/v1/config updates single config key', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: { key: 'ai.model', value: 'gpt-5.4' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data['ai.model']).toBe('gpt-5.4');

    // Verify persistence
    const getResponse = await request.get('/api/v1/config');
    const getBody = await getResponse.json();
    expect(getBody.data['ai.model']).toBe('gpt-5.4');
  });

  test('PUT /api/v1/config rejects batch custom-field extraction without an approved policy', async ({
    request,
  }) => {
    const response = await request.put('/api/v1/config', {
      data: {
        settings: {
          'ai.batchSize': 50,
          'ai.extractCustomFields': true,
        },
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Validation failed');
    const current = await (await request.get('/api/v1/config')).json();
    expect(current.data['ai.batchSize']).toBeUndefined();
    expect(current.data['ai.extractCustomFields']).toBeUndefined();
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

  test('all config mutation routes reject duplicate JSON property names', async ({ request }) => {
    const cases = [
      {
        path: '/api/v1/config',
        body: '{"settings":{"ai.model":"gpt-5.4-mini","ai.model":"gpt-5.4"}}',
      },
      {
        path: '/api/v1/ai/config',
        body: '{"model":"gpt-5.4-mini","m\\u006fdel":"gpt-5.4"}',
      },
      {
        path: '/api/v1/config/dedup',
        body: '{"minWords":10,"minWords":20}',
      },
    ];

    for (const item of cases) {
      const response = await request.put(item.path, {
        headers: { 'Content-Type': 'application/json' },
        data: item.body,
      });
      expect(response.status(), item.path).toBe(400);
    }
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

  test('POST /api/v1/config/test-connection ignores supplied credentials and uses runtime config', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/config/test-connection', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        url: 'http://invalid.example.test',
        token: 'request-token-must-be-ignored',
        username: 'request-user-must-be-ignored',
        password: 'request-password-must-be-ignored',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('request-token-must-be-ignored');
    expect(JSON.stringify(body)).not.toContain('request-password-must-be-ignored');
    expect(body.data.connected).toBe(true);
    expect(body.data).toHaveProperty('version');
    expect(body.data).toHaveProperty('documentCount');
  });
});
