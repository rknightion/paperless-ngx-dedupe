import { test, expect } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';

test.describe('Documents API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('GET /api/v1/documents returns paginated list', async ({ request }) => {
    const response = await request.get('/api/v1/documents');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBe(10);

    // Verify document shape
    const doc = body.data[0];
    expect(doc).toHaveProperty('id');
    expect(doc).toHaveProperty('paperlessId');
    expect(doc).toHaveProperty('title');
    expect(doc).toHaveProperty('processingStatus');
  });

  test('GET /api/v1/documents supports limit/offset pagination', async ({ request }) => {
    const response = await request.get('/api/v1/documents?limit=3&offset=2');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(3);
    expect(body.meta.limit).toBe(3);
    expect(body.meta.offset).toBe(2);
    expect(body.meta.total).toBe(10);
  });

  test('GET /api/v1/documents/:id returns single document', async ({ request }) => {
    const docId = seed.documentIds[0];
    const response = await request.get(`/api/v1/documents/${docId}`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(docId);
    expect(body.data.title).toBeDefined();
    expect(body.data.paperlessId).toBeDefined();
    expect(body.data).toHaveProperty('content');
    expect(body.data).toHaveProperty('groupMemberships');
    expect(Array.isArray(body.data.groupMemberships)).toBe(true);
  });

  test('GET /api/v1/documents/:id returns 404 for nonexistent', async ({ request }) => {
    const response = await request.get('/api/v1/documents/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/v1/documents/stats returns expected shape', async ({ request }) => {
    const response = await request.get('/api/v1/documents/stats');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(typeof data.totalDocuments).toBe('number');
    expect(data.totalDocuments).toBe(10);

    // OCR coverage
    expect(data.ocrCoverage).toBeDefined();
    expect(typeof data.ocrCoverage.withContent).toBe('number');
    expect(typeof data.ocrCoverage.withoutContent).toBe('number');
    expect(typeof data.ocrCoverage.percentage).toBe('number');

    // Processing status
    expect(data.processingStatus).toBeDefined();
    expect(typeof data.processingStatus.pending).toBe('number');
    expect(typeof data.processingStatus.completed).toBe('number');

    // Distributions
    expect(Array.isArray(data.correspondentDistribution)).toBe(true);
    expect(Array.isArray(data.documentTypeDistribution)).toBe(true);
    expect(Array.isArray(data.tagDistribution)).toBe(true);
    expect(Array.isArray(data.fileSizeDistribution)).toBe(true);
    expect(Array.isArray(data.wordCountDistribution)).toBe(true);
    expect(Array.isArray(data.documentsOverTime)).toBe(true);
    expect(Array.isArray(data.largestDocuments)).toBe(true);

    // Scalar stats
    expect(typeof data.totalStorageBytes).toBe('number');
    expect(typeof data.averageWordCount).toBe('number');

    // Unclassified
    expect(data.unclassified).toBeDefined();
    expect(typeof data.unclassified.noCorrespondent).toBe('number');
    expect(typeof data.unclassified.noDocumentType).toBe('number');
    expect(typeof data.unclassified.noTags).toBe('number');

    // Duplicate involvement
    expect(data.duplicateInvolvement).toBeDefined();
    expect(typeof data.duplicateInvolvement.documentsInGroups).toBe('number');
    expect(typeof data.duplicateInvolvement.percentage).toBe('number');

    // Usage stats
    expect(data.usageStats).toBeDefined();
  });
});
