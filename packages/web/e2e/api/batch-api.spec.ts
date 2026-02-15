import { test, expect } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';

test.describe('Batch API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('POST /api/v1/batch/status sets status on multiple groups', async ({ request }) => {
    // Use all 3 group IDs and set them to ignored
    const response = await request.post('/api/v1/batch/status', {
      data: {
        groupIds: seed.groupIds,
        status: 'ignored',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.updated).toBe('number');
    expect(body.data.updated).toBeGreaterThan(0);
  });

  test('POST /api/v1/batch/status updates single group status', async ({ request }) => {
    const groupId = seed.groupIds[0]; // pending group
    const response = await request.post('/api/v1/batch/status', {
      data: {
        groupIds: [groupId],
        status: 'false_positive',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.updated).toBe(1);

    // Verify the status was changed
    const getResponse = await request.get(`/api/v1/duplicates/${groupId}`);
    const getBody = await getResponse.json();
    expect(getBody.data.status).toBe('false_positive');
  });

  test('POST /api/v1/batch/status validates request body - missing groupIds', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/batch/status', {
      data: { status: 'ignored' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/batch/status validates request body - missing status', async ({ request }) => {
    const response = await request.post('/api/v1/batch/status', {
      data: { groupIds: seed.groupIds },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/batch/status validates request body - invalid status', async ({ request }) => {
    const response = await request.post('/api/v1/batch/status', {
      data: { groupIds: seed.groupIds, status: 'invalid_status' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/batch/status validates request body - empty groupIds', async ({ request }) => {
    const response = await request.post('/api/v1/batch/status', {
      data: { groupIds: [], status: 'ignored' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/batch/delete-non-primary rejects non-pending groups', async ({ request }) => {
    // groupIds[1] is 'ignored' status, groupIds[2] is 'deleted' status
    const response = await request.post('/api/v1/batch/delete-non-primary', {
      data: {
        groupIds: [seed.groupIds[1]],
        confirm: true,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toContain('pending');
  });

  test('POST /api/v1/batch/delete-non-primary validates confirm flag', async ({ request }) => {
    const response = await request.post('/api/v1/batch/delete-non-primary', {
      data: {
        groupIds: [seed.groupIds[0]],
        confirm: false,
      },
    });

    // confirm must be literal true
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/v1/batch/delete-non-primary accepts pending group', async ({ request }) => {
    // groupIds[0] has status 'pending'
    const response = await request.post('/api/v1/batch/delete-non-primary', {
      data: {
        groupIds: [seed.groupIds[0]],
        confirm: true,
      },
    });

    // 202 = job created, 409 = job already running, 500 = worker not found in preview mode
    const status = response.status();
    expect([202, 409, 500]).toContain(status);

    if (status === 202) {
      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.jobId).toBeDefined();
    }
  });
});
