import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import {
  createDatabaseWithHandle,
  migrateDatabase,
  parseConfig,
  document,
  duplicateGroup,
  duplicateMember,
  getReviewedMutationPlan,
} from '@paperless-dedupe/core';

const runtime = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../../../runtime.server', () => ({ getServerRuntime: runtime.get }));
import { POST } from './+server';

async function preview(mergeMetadata: unknown, responseStatus = 200) {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    requests.push(path);
    const results =
      path === '/api/tags/'
        ? [{ id: 1, name: 'Inbox', is_inbox_tag: true }]
        : [{ id: 7, name: 'Reference', data_type: 'string' }];
    response
      .writeHead(responseStatus, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ count: 1, next: null, previous: null, results }));
  });
  try {
    await migrateDatabase(sqlite);
    db.insert(document)
      .values([
        {
          id: 'keeper',
          paperlessId: 101,
          title: 'Synthetic keeper',
          syncedAt: '2026-07-24T12:00:00Z',
          tagsJson: '["Retained"]',
        },
        {
          id: 'copy',
          paperlessId: 102,
          title: 'Synthetic copy',
          syncedAt: '2026-07-24T12:00:00Z',
          tagsJson: '["Inbox","Added"]',
          correspondent: 'Synthetic supplier',
          customFieldsJson: '[{"field":7,"value":"synthetic reference"}]',
        },
      ])
      .run();
    db.insert(duplicateGroup)
      .values({
        id: 'group',
        confidenceScore: 0.98,
        algorithmVersion: 'synthetic',
        status: 'pending',
        createdAt: '2026-07-24T12:00:00Z',
        updatedAt: '2026-07-24T12:00:00Z',
      })
      .run();
    db.insert(duplicateMember)
      .values([
        { id: 'member-keeper', groupId: 'group', documentId: 'keeper', isPrimary: true },
        { id: 'member-copy', groupId: 'group', documentId: 'copy', isPrimary: false },
      ])
      .run();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const config = parseConfig({
      PAPERLESS_URL: `http://127.0.0.1:${address.port}`,
      PAPERLESS_API_TOKEN: 'synthetic-token',
    });
    runtime.get.mockResolvedValue({
      config,
      acceptingGate: {
        assertAccepting() {},
        run<T>(operation: () => T): T {
          return operation();
        },
      },
    });
    const response = await POST({
      locals: { db, config },
      request: new Request('http://app.example.test/api/v1/batch/delete-non-primary/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupIds: ['group'],
          ...(mergeMetadata === undefined ? {} : { mergeMetadata }),
        }),
      }),
    } as never);
    const body = await response.json();
    const payload = body.data?.planToken
      ? JSON.parse(getReviewedMutationPlan(db, body.data.planToken, 'duplicate_delete').payloadJson)
      : undefined;
    return {
      status: response.status,
      body,
      payload,
      requests,
      planCount: (
        sqlite.prepare('SELECT count(*) AS count FROM reviewed_mutation_plan').get() as {
          count: number;
        }
      ).count,
    };
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    sqlite.close();
  }
}

it('previews local additions with live inbox and custom-field names and freezes the enabled option', async () => {
  const result = await preview(true);
  expect(result.status).toBe(200);
  expect(result.body.data.groups[0].merge).toEqual({
    addTags: ['Added'],
    setCorrespondent: 'Synthetic supplier',
    setDocumentType: null,
    addCustomFieldNames: ['Reference'],
  });
  expect(result.payload).toEqual({ groups: result.body.data.groups, mergeMetadata: true });
  expect(result.requests.sort()).toEqual(['/api/custom_fields/', '/api/tags/']);
  expect(JSON.stringify(result.body)).not.toContain('synthetic reference');
});

it('keeps omitted and false options identical and makes no metadata requests', async () => {
  const omitted = await preview(undefined);
  const disabled = await preview(false);
  expect(omitted.status).toBe(200);
  expect(disabled.status).toBe(200);
  expect(disabled.body.data.groups).toEqual(omitted.body.data.groups);
  for (const result of [omitted, disabled]) {
    expect(result.requests).toEqual([]);
    expect(result.payload).toEqual({ groups: result.body.data.groups });
    expect(result.body.data.groups[0]).not.toHaveProperty('merge');
  }
});

it('requires a boolean option before making metadata requests or storing a plan', async () => {
  const result = await preview('yes');
  expect(result.status).toBe(400);
  expect(result.body.error.code).toBe('VALIDATION_FAILED');
  expect(result.planCount).toBe(0);
  expect(result.requests).toEqual([]);
});

it('returns a structured upstream failure without storing a merge preview', async () => {
  const result = await preview(true, 401);
  expect(result.status).toBe(502);
  expect(result.body.error).toMatchObject({ code: 'BAD_GATEWAY', retryable: false });
  expect(result.planCount).toBe(0);
});
