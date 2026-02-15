import { test, expect } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';

test.describe('Duplicates Extended API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('PUT /api/v1/duplicates/:id/primary sets primary document', async ({ request }) => {
    const groupId = seed.groupIds[0];

    // Get the group detail to find its members
    const detailResponse = await request.get(`/api/v1/duplicates/${groupId}`);
    const detailBody = await detailResponse.json();
    const members = detailBody.data.members;
    expect(members.length).toBeGreaterThanOrEqual(2);

    // Set the second member as primary
    const newPrimaryDocId = members[1].documentId;
    const response = await request.put(`/api/v1/duplicates/${groupId}/primary`, {
      data: { documentId: newPrimaryDocId },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.groupId).toBe(groupId);
    expect(body.data.documentId).toBe(newPrimaryDocId);

    // Verify the primary was updated
    const verifyResponse = await request.get(`/api/v1/duplicates/${groupId}`);
    const verifyBody = await verifyResponse.json();
    const updatedMembers = verifyBody.data.members;
    const primary = updatedMembers.find((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary.documentId).toBe(newPrimaryDocId);
  });

  test('PUT /api/v1/duplicates/:id/primary returns 404 for nonexistent group', async ({
    request,
  }) => {
    const response = await request.put('/api/v1/duplicates/nonexistent-id/primary', {
      data: { documentId: seed.documentIds[0] },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('PUT /api/v1/duplicates/:id/primary validates request body', async ({ request }) => {
    const response = await request.put(`/api/v1/duplicates/${seed.groupIds[0]}/primary`, {
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('GET /api/v1/duplicates/:id/content returns document content', async ({ request }) => {
    const groupId = seed.groupIds[0];

    // Get the group detail to find member document IDs
    const detailResponse = await request.get(`/api/v1/duplicates/${groupId}`);
    const detailBody = await detailResponse.json();
    const members = detailBody.data.members;
    expect(members.length).toBeGreaterThanOrEqual(2);

    const docA = members[0].documentId;
    const docB = members[1].documentId;

    const response = await request.get(
      `/api/v1/duplicates/${groupId}/content?docA=${docA}&docB=${docB}`,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.docA).toBeDefined();
    expect(body.data.docB).toBeDefined();
    expect(body.data.docA).toHaveProperty('fullText');
    expect(body.data.docA).toHaveProperty('wordCount');
    expect(body.data.docB).toHaveProperty('fullText');
    expect(body.data.docB).toHaveProperty('wordCount');
  });

  test('GET /api/v1/duplicates/:id/content requires docA and docB', async ({ request }) => {
    const groupId = seed.groupIds[0];

    const response = await request.get(`/api/v1/duplicates/${groupId}/content`);

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toContain('docA');
    expect(body.error.message).toContain('docB');
  });

  test('GET /api/v1/duplicates/:id/content rejects non-member documents', async ({ request }) => {
    const groupId = seed.groupIds[0];
    // Use document IDs that are not members of this group
    // Group 0 has documents at index 0,1; use documents from index 5,6
    const nonMemberDocA = seed.documentIds[5];
    const nonMemberDocB = seed.documentIds[6];

    const response = await request.get(
      `/api/v1/duplicates/${groupId}/content?docA=${nonMemberDocA}&docB=${nonMemberDocB}`,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toContain('not members');
  });

  test('GET /api/v1/duplicates/stats returns duplicate statistics', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates/stats');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(typeof data.totalGroups).toBe('number');
    expect(data.totalGroups).toBe(3);
    expect(typeof data.pendingGroups).toBe('number');
    expect(data.pendingGroups).toBe(1);
    expect(typeof data.falsePositiveGroups).toBe('number');
    expect(typeof data.ignoredGroups).toBe('number');
    expect(data.ignoredGroups).toBe(1);
    expect(typeof data.deletedGroups).toBe('number');
    expect(data.deletedGroups).toBe(1);

    // Confidence distribution
    expect(Array.isArray(data.confidenceDistribution)).toBe(true);
    expect(data.confidenceDistribution.length).toBeGreaterThan(0);
    for (const bucket of data.confidenceDistribution) {
      expect(bucket).toHaveProperty('label');
      expect(bucket).toHaveProperty('min');
      expect(bucket).toHaveProperty('max');
      expect(bucket).toHaveProperty('count');
    }

    // Top correspondents
    expect(Array.isArray(data.topCorrespondents)).toBe(true);
  });

  test('GET /api/v1/duplicates/graph returns graph data', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates/graph');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(typeof data.totalGroupsMatched).toBe('number');
    expect(typeof data.groupsIncluded).toBe('number');

    // With seed data, we should have nodes and edges
    expect(data.nodes.length).toBeGreaterThan(0);
    expect(data.edges.length).toBeGreaterThan(0);

    // Verify node shape
    const node = data.nodes[0];
    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('paperlessId');
    expect(node).toHaveProperty('title');
    expect(node).toHaveProperty('groupCount');

    // Verify edge shape
    const edge = data.edges[0];
    expect(edge).toHaveProperty('source');
    expect(edge).toHaveProperty('target');
    expect(edge).toHaveProperty('groupId');
    expect(edge).toHaveProperty('confidenceScore');
    expect(edge).toHaveProperty('status');
  });

  test('GET /api/v1/duplicates/graph supports minConfidence filter', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates/graph?minConfidence=0.9');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    // Only the 0.95 confidence group should match
    for (const edge of body.data.edges) {
      expect(edge.confidenceScore).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('GET /api/v1/duplicates/graph supports status filter', async ({ request }) => {
    const response = await request.get('/api/v1/duplicates/graph?status=pending');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    for (const edge of body.data.edges) {
      expect(edge.status).toBe('pending');
    }
  });
});
