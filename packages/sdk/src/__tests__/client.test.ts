import { describe, it, expect, vi } from 'vitest';
import { PaperlessDedupeClient } from '../client.js';
import { PaperlessDedupeApiError } from '../errors.js';
import type { ConfigBackup } from '../types.js';

function mockFetch(data: unknown, meta?: unknown, status = 200) {
  return vi.fn<typeof globalThis.fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi
      .fn()
      .mockResolvedValue(
        status >= 200 && status < 300 ? { data, ...(meta ? { meta } : {}) } : { error: data },
      ),
    headers: new Headers(),
    body: null,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: vi.fn(),
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
    bytes: vi.fn(),
  } as Response);
}

function createClient(fetchFn: typeof globalThis.fetch) {
  return new PaperlessDedupeClient({
    baseUrl: 'http://localhost:3000',
    fetch: fetchFn,
  });
}

describe('PaperlessDedupeClient', () => {
  // ── Health ─────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns health status', async () => {
      const fetch = mockFetch({ status: 'ok' });
      const client = createClient(fetch);

      const result = await client.health();
      expect(result).toEqual({ status: 'ok' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/health', expect.any(Object));
    });
  });

  describe('ready()', () => {
    it('returns ready status', async () => {
      const fetch = mockFetch({ status: 'ready' });
      const client = createClient(fetch);

      const result = await client.ready();
      expect(result).toEqual({ status: 'ready' });
    });
  });

  // ── Sync & Analysis ────────────────────────────────────────────────

  describe('sync()', () => {
    it('sends POST and returns job', async () => {
      const job = { id: 'job-1', type: 'sync', status: 'pending', createdAt: '2024-01-01' };
      const fetch = mockFetch(job);
      const client = createClient(fetch);

      const result = await client.sync();
      expect(result).toEqual(job);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/sync',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('analyze()', () => {
    it('sends POST and returns job', async () => {
      const job = { id: 'job-2', type: 'analysis', status: 'pending', createdAt: '2024-01-01' };
      const fetch = mockFetch(job);
      const client = createClient(fetch);

      const result = await client.analyze();
      expect(result).toEqual(job);
    });
  });

  // ── Documents ──────────────────────────────────────────────────────

  describe('listDocuments()', () => {
    it('returns paginated documents', async () => {
      const docs = [{ id: 'doc-1', title: 'Test' }];
      const meta = { total: 1, limit: 50, offset: 0 };
      const fetch = mockFetch(docs, meta);
      const client = createClient(fetch);

      const result = await client.listDocuments({ limit: 50, offset: 0 });
      expect(result.data).toEqual(docs);
      expect(result.meta).toEqual(meta);
    });

    it('passes filter params as query string', async () => {
      const fetch = mockFetch([], { total: 0, limit: 10, offset: 0 });
      const client = createClient(fetch);

      await client.listDocuments({ limit: 10, search: 'invoice', correspondent: 'Acme' });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=invoice'),
        expect.any(Object),
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('correspondent=Acme'),
        expect.any(Object),
      );
    });
  });

  describe('getDocument()', () => {
    it('returns document detail', async () => {
      const doc = { id: 'doc-1', title: 'Test', paperlessId: 42 };
      const fetch = mockFetch(doc);
      const client = createClient(fetch);

      const result = await client.getDocument('doc-1');
      expect(result).toEqual(doc);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/documents/doc-1',
        expect.any(Object),
      );
    });
  });

  describe('getDocumentContent()', () => {
    it('returns document content', async () => {
      const content = { fullText: 'Hello world' };
      const fetch = mockFetch(content);
      const client = createClient(fetch);

      const result = await client.getDocumentContent('doc-1');
      expect(result).toEqual(content);
    });
  });

  describe('getDocumentStats()', () => {
    it('returns document stats', async () => {
      const stats = { totalDocuments: 100 };
      const fetch = mockFetch(stats);
      const client = createClient(fetch);

      const result = await client.getDocumentStats();
      expect(result).toEqual(stats);
    });
  });

  // ── Duplicates ─────────────────────────────────────────────────────

  describe('listDuplicates()', () => {
    it('returns paginated duplicates with filters', async () => {
      const groups = [{ id: 'g-1', confidenceScore: 0.95 }];
      const meta = { total: 1, limit: 50, offset: 0 };
      const fetch = mockFetch(groups, meta);
      const client = createClient(fetch);

      const result = await client.listDuplicates({
        minConfidence: 0.8,
        reviewed: false,
        sortBy: 'confidence',
      });
      expect(result.data).toEqual(groups);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('minConfidence=0.8'),
        expect.any(Object),
      );
    });
  });

  describe('getDuplicate()', () => {
    it('returns duplicate group detail', async () => {
      const group = { id: 'g-1', members: [] };
      const fetch = mockFetch(group);
      const client = createClient(fetch);

      const result = await client.getDuplicate('g-1');
      expect(result).toEqual(group);
    });
  });

  describe('getDuplicateStats()', () => {
    it('returns duplicate stats', async () => {
      const stats = { totalGroups: 10 };
      const fetch = mockFetch(stats);
      const client = createClient(fetch);

      const result = await client.getDuplicateStats();
      expect(result).toEqual(stats);
    });
  });

  describe('getDuplicateGraph()', () => {
    it('returns graph data with filters', async () => {
      const graph = { nodes: [], edges: [], totalGroupsMatched: 0, groupsIncluded: 0 };
      const fetch = mockFetch(graph);
      const client = createClient(fetch);

      const result = await client.getDuplicateGraph({ maxGroups: 50 });
      expect(result).toEqual(graph);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('maxGroups=50'),
        expect.any(Object),
      );
    });
  });

  describe('setPrimary()', () => {
    it('sends POST with documentId', async () => {
      const group = { id: 'g-1', members: [] };
      const fetch = mockFetch(group);
      const client = createClient(fetch);

      await client.setPrimary('g-1', 'doc-2');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/duplicates/g-1/primary',
        expect.objectContaining({
          method: 'POST',
          body: '{"documentId":"doc-2"}',
        }),
      );
    });
  });

  describe('markReviewed()', () => {
    it('sends POST to mark reviewed', async () => {
      const fetch = mockFetch({ id: 'g-1', reviewed: true });
      const client = createClient(fetch);

      await client.markReviewed('g-1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/duplicates/g-1/reviewed',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('markResolved()', () => {
    it('sends POST to mark resolved', async () => {
      const fetch = mockFetch({ id: 'g-1', resolved: true });
      const client = createClient(fetch);

      await client.markResolved('g-1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/duplicates/g-1/resolved',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('deleteDuplicate()', () => {
    it('sends DELETE request', async () => {
      const fetch = mockFetch({});
      const client = createClient(fetch);

      await client.deleteDuplicate('g-1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/duplicates/g-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  // ── Batch Operations ───────────────────────────────────────────────

  describe('batchReview()', () => {
    it('sends POST with groupIds', async () => {
      const fetch = mockFetch({ processed: 3 });
      const client = createClient(fetch);

      const result = await client.batchReview(['g-1', 'g-2', 'g-3']);
      expect(result).toEqual({ processed: 3 });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/batch/review',
        expect.objectContaining({
          body: '{"groupIds":["g-1","g-2","g-3"]}',
        }),
      );
    });
  });

  describe('batchResolve()', () => {
    it('sends POST with groupIds', async () => {
      const fetch = mockFetch({ processed: 2 });
      const client = createClient(fetch);

      const result = await client.batchResolve(['g-1', 'g-2']);
      expect(result).toEqual({ processed: 2 });
    });
  });

  describe('batchDeleteNonPrimary()', () => {
    it('sends POST with groupIds and confirm', async () => {
      const fetch = mockFetch({ processed: 1, deleted: 3 });
      const client = createClient(fetch);

      const result = await client.batchDeleteNonPrimary(['g-1'], true);
      expect(result).toEqual({ processed: 1, deleted: 3 });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/batch/delete-non-primary',
        expect.objectContaining({
          body: '{"groupIds":["g-1"],"confirm":true}',
        }),
      );
    });
  });

  // ── Dashboard ──────────────────────────────────────────────────────

  describe('getDashboard()', () => {
    it('returns dashboard data', async () => {
      const dashboard = { totalDocuments: 500, unresolvedGroups: 10 };
      const fetch = mockFetch(dashboard);
      const client = createClient(fetch);

      const result = await client.getDashboard();
      expect(result).toEqual(dashboard);
    });
  });

  // ── Config ─────────────────────────────────────────────────────────

  describe('getConfig()', () => {
    it('returns config', async () => {
      const config = { 'app.name': 'test' };
      const fetch = mockFetch(config);
      const client = createClient(fetch);

      const result = await client.getConfig();
      expect(result).toEqual(config);
    });
  });

  describe('updateConfig()', () => {
    it('sends PUT with settings', async () => {
      const fetch = mockFetch({ 'app.name': 'updated' });
      const client = createClient(fetch);

      await client.updateConfig({ 'app.name': 'updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/config',
        expect.objectContaining({
          method: 'PUT',
          body: '{"settings":{"app.name":"updated"}}',
        }),
      );
    });
  });

  // ── Dedup Config ───────────────────────────────────────────────────

  describe('getDedupConfig()', () => {
    it('returns dedup config', async () => {
      const config = { numPermutations: 192, numBands: 20 };
      const fetch = mockFetch(config);
      const client = createClient(fetch);

      const result = await client.getDedupConfig();
      expect(result).toEqual(config);
    });
  });

  describe('updateDedupConfig()', () => {
    it('sends PUT with partial config', async () => {
      const fetch = mockFetch({ numPermutations: 256 });
      const client = createClient(fetch);

      await client.updateDedupConfig({ numPermutations: 256 });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/dedup-config',
        expect.objectContaining({
          method: 'PUT',
          body: '{"numPermutations":256}',
        }),
      );
    });
  });

  describe('recalculateDedupConfig()', () => {
    it('sends POST and returns job', async () => {
      const job = { id: 'job-3', type: 'analysis', status: 'pending' };
      const fetch = mockFetch(job);
      const client = createClient(fetch);

      const result = await client.recalculateDedupConfig();
      expect(result).toEqual(job);
    });
  });

  // ── Jobs ───────────────────────────────────────────────────────────

  describe('getJob()', () => {
    it('returns job by id', async () => {
      const job = { id: 'job-1', type: 'sync', status: 'completed' };
      const fetch = mockFetch(job);
      const client = createClient(fetch);

      const result = await client.getJob('job-1');
      expect(result).toEqual(job);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/jobs/job-1',
        expect.any(Object),
      );
    });
  });

  // ── Export / Import ────────────────────────────────────────────────

  describe('exportDuplicatesCsv()', () => {
    it('returns CSV as text', async () => {
      const csvContent = 'groupId,title\ng-1,Test';
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(csvContent),
        headers: new Headers(),
        body: null,
      } as unknown as Response);
      const client = createClient(fetch);

      const result = await client.exportDuplicatesCsv();
      expect(result).toBe(csvContent);
    });

    it('passes filters as query string', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers(),
        body: null,
      } as unknown as Response);
      const client = createClient(fetch);

      await client.exportDuplicatesCsv({ minConfidence: 0.9 });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('minConfidence=0.9'),
        expect.any(Object),
      );
    });
  });

  describe('exportConfig()', () => {
    it('returns config backup', async () => {
      const backup = { version: '1.0', exportedAt: '2024-01-01', appConfig: {}, dedupConfig: {} };
      const fetch = mockFetch(backup);
      const client = createClient(fetch);

      const result = await client.exportConfig();
      expect(result).toEqual(backup);
    });
  });

  describe('importConfig()', () => {
    it('sends POST with config backup', async () => {
      const backup = {
        version: '1.0',
        exportedAt: '2024-01-01',
        appConfig: {},
        dedupConfig: {} as unknown as ConfigBackup['dedupConfig'],
      };
      const fetch = mockFetch(backup);
      const client = createClient(fetch);

      await client.importConfig(backup);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/import/config',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── Error handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws PaperlessDedupeApiError on API error', async () => {
      const fetch = mockFetch({ code: 'NOT_FOUND', message: 'Not found' }, undefined, 404);
      const client = createClient(fetch);

      await expect(client.getDocument('missing')).rejects.toThrow(PaperlessDedupeApiError);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('strips trailing slashes from baseUrl', async () => {
      const fetch = mockFetch({ status: 'ok' });
      const client = new PaperlessDedupeClient({
        baseUrl: 'http://localhost:3000///',
        fetch,
      });

      await client.health();
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/health', expect.any(Object));
    });
  });
});
