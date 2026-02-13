import { test, expect } from '../fixtures/test-app';

test.describe('Health API', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/health returns 200 with expected shape', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe('ok');
    expect(body.data.timestamp).toBeDefined();
  });

  test('GET /api/v1/ready returns 200 when services are up', async ({ request }) => {
    const response = await request.get('/api/v1/ready');

    // May return 200 or 503 depending on Paperless reachability
    const body = await response.json();
    expect(body.data || body.error).toBeDefined();

    if (response.status() === 200) {
      expect(body.data.status).toBe('ready');
      expect(body.data.checks).toBeDefined();
      expect(body.data.checks.database).toBeDefined();
    }
  });
});
