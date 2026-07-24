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
    expect(body.error.operation).toBe('api_request');
    expect(body.error.message).toBe('Validation failed');
  });

  test('POST /api/v1/batch/delete-non-primary/preview freezes the exact reviewed selection', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/batch/delete-non-primary/preview', {
      data: {
        groupIds: [seed.groupIds[0]],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      expiresAt: expect.any(String),
      groupCount: 1,
      documentCount: 1,
      groups: [
        {
          groupId: seed.groupIds[0],
          updatedAt: '2024-01-10T00:00:00Z',
          primaryDocumentId: seed.documentIds[0],
          primaryPaperlessId: 1,
          nonPrimaryDocuments: [
            {
              documentId: seed.documentIds[1],
              paperlessId: 2,
            },
          ],
        },
      ],
    });
    expect(body.data.planToken).toEqual(expect.any(String));
    expect(body.data.planToken.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(body.data.planToken)).not.toContain(seed.groupIds[0]);
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

  test('reviewed preview token executes through the production worker and persists its result', async ({
    request,
  }) => {
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
    const previewResponse = await request.post('/api/v1/batch/delete-non-primary/preview', {
      data: {
        groupIds: [seed.groupIds[0]],
      },
    });
    expect(previewResponse.status()).toBe(200);
    const preview = await previewResponse.json();

    const response = await request.post('/api/v1/batch/delete-non-primary', {
      data: {
        planToken: preview.data.planToken,
        confirm: true,
      },
    });

    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.data.jobId).toEqual(expect.any(String));

    let completedJob: {
      status: string;
      resultJson: string | null;
      errorMessage: string | null;
    } | null = null;
    await expect
      .poll(
        async () => {
          const jobResponse = await request.get(`/api/v1/jobs/${body.data.jobId}`);
          expect(jobResponse.status()).toBe(200);
          const jobBody = await jobResponse.json();
          completedJob = jobBody.data;
          return completedJob?.status;
        },
        { timeout: 15_000 },
      )
      .toBe('completed');

    expect(completedJob?.errorMessage).toBeNull();
    expect(JSON.parse(completedJob?.resultJson ?? 'null')).toMatchObject({
      deletedDocuments: 1,
      alreadyMissingDocuments: 0,
      deletedGroups: 1,
      conflicts: [],
      errors: [],
    });

    const groupResponse = await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`);
    expect(groupResponse.status()).toBe(200);
    const group = await groupResponse.json();
    expect(group.data).toMatchObject({
      status: 'deleted',
      archivedMemberCount: 2,
    });

    const remote = await fetch('http://localhost:18923/api/documents/2/', {
      headers: { Authorization: 'Token test-token-e2e' },
    });
    expect(remote.status).toBe(404);
    const remoteBody = await remote.json();
    expect(remoteBody).toEqual({ detail: 'Not found.' });
  });
});
