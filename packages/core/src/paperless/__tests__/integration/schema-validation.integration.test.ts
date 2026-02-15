import { describe, it, expect, beforeAll } from 'vitest';
import {
  paperlessStatisticsSchema,
  paperlessDocumentSchema,
  documentMetadataSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paginatedResponseSchema,
} from '../../schemas.js';
import { seedDocuments, PAPERLESS_URL } from './setup.js';

describe.skipIf(!process.env.INTEGRATION_TEST)(
  'Schema validation against real Paperless-NGX',
  () => {
    let token: string;
    let headers: Record<string, string>;

    beforeAll(async () => {
      token = await seedDocuments(5);
      headers = {
        Authorization: `Token ${token}`,
        Accept: 'application/json; version=9',
      };
    }, 180_000);

    it('paperlessStatisticsSchema validates /api/statistics/', async () => {
      const response = await fetch(`${PAPERLESS_URL}/api/statistics/`, { headers });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const result = paperlessStatisticsSchema.safeParse(raw);

      if (!result.success) {
        console.error('Statistics schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('paperlessDocumentSchema validates individual document from /api/documents/:id/', async () => {
      // First, get a document ID from the list
      const listResponse = await fetch(`${PAPERLESS_URL}/api/documents/?page_size=1`, { headers });
      expect(listResponse.ok).toBe(true);

      const listJson = await listResponse.json();
      expect(listJson.results.length).toBeGreaterThan(0);

      const docId = listJson.results[0].id;
      const response = await fetch(`${PAPERLESS_URL}/api/documents/${docId}/`, { headers });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const result = paperlessDocumentSchema.safeParse(raw);

      if (!result.success) {
        console.error('Document schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('paginatedResponseSchema(paperlessDocumentSchema) validates /api/documents/', async () => {
      const response = await fetch(`${PAPERLESS_URL}/api/documents/?page_size=10`, { headers });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const schema = paginatedResponseSchema(paperlessDocumentSchema);
      const result = schema.safeParse(raw);

      if (!result.success) {
        console.error('Paginated documents schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
      expect(result.data!.results.length).toBeGreaterThan(0);
    });

    it('documentMetadataSchema validates /api/documents/:id/metadata/', async () => {
      // Get a document ID
      const listResponse = await fetch(`${PAPERLESS_URL}/api/documents/?page_size=1`, { headers });
      const listJson = await listResponse.json();
      const docId = listJson.results[0].id;

      const response = await fetch(`${PAPERLESS_URL}/api/documents/${docId}/metadata/`, {
        headers,
      });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const result = documentMetadataSchema.safeParse(raw);

      if (!result.success) {
        console.error('Document metadata schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('paperlessTagSchema validates /api/tags/', async () => {
      const response = await fetch(`${PAPERLESS_URL}/api/tags/?page_size=100`, { headers });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const schema = paginatedResponseSchema(paperlessTagSchema);
      const result = schema.safeParse(raw);

      if (!result.success) {
        console.error('Tags schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);

      // Tags array may be empty in a fresh instance, just validate the structure parsed
      expect(result.data).toBeDefined();
    });

    it('paperlessCorrespondentSchema validates /api/correspondents/', async () => {
      const response = await fetch(`${PAPERLESS_URL}/api/correspondents/?page_size=100`, {
        headers,
      });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const schema = paginatedResponseSchema(paperlessCorrespondentSchema);
      const result = schema.safeParse(raw);

      if (!result.success) {
        console.error('Correspondents schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('paperlessDocumentTypeSchema validates /api/document_types/', async () => {
      const response = await fetch(`${PAPERLESS_URL}/api/document_types/?page_size=100`, {
        headers,
      });
      expect(response.ok).toBe(true);

      const raw = await response.json();
      const schema = paginatedResponseSchema(paperlessDocumentTypeSchema);
      const result = schema.safeParse(raw);

      if (!result.success) {
        console.error('Document types schema validation errors:', result.error.issues);
      }
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  },
);
