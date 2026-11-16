import { afterEach, expect, it, vi } from 'vitest';
import { PaperlessClient } from '../client.js';

afterEach(() => vi.unstubAllGlobals());

it.each([
  [
    'updateDocument',
    (client: PaperlessClient) => client.updateDocument(1, { title: 'Synthetic title' }),
  ],
  [
    'createCorrespondent',
    (client: PaperlessClient) => client.createCorrespondent('Synthetic correspondent'),
  ],
  ['createDocumentType', (client: PaperlessClient) => client.createDocumentType('Synthetic type')],
  ['createTag', (client: PaperlessClient) => client.createTag('Synthetic tag')],
  ['deleteDocument', (client: PaperlessClient) => client.deleteDocument(1)],
  ['bulkEdit', (client: PaperlessClient) => client.bulkEdit([1], 'delete', {})],
] as const)(
  'mutating methods throw PaperlessReadOnlyError when readOnly is set: %s',
  async (_name, mutate) => {
    const fetch = vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response(
            JSON.stringify({ id: 1, name: 'Synthetic value', slug: 'synthetic-value' }),
            { status: 200 },
          ),
    );
    vi.stubGlobal('fetch', fetch);
    const client = new PaperlessClient({
      url: 'https://paperless.example.test',
      token: 'synthetic-token',
      readOnly: true,
    });
    await expect(mutate(client)).rejects.toMatchObject({ name: 'PaperlessReadOnlyError' });
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each([true, false])(
  'keeps document, file and catalogue reads available with readOnly %s',
  async (readOnly) => {
    const document = {
      id: 1,
      title: 'Synthetic title',
      content: 'Synthetic text',
      tags: [],
      correspondent: null,
      document_type: null,
      created: '2024-01-01',
      modified: '2024-01-01',
      added: '2024-01-01',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/metadata/')
          ? {
              original_checksum: 'synthetic-checksum',
              original_size: 12,
              archive_size: null,
              has_archive_version: false,
            }
          : url.includes('/tags/')
            ? { count: 1, results: [{ id: 2, name: 'Synthetic tag', slug: 'synthetic-tag' }] }
            : document;
        return Response.json(body);
      }),
    );
    const client = new PaperlessClient({
      url: 'https://paperless.example.test',
      token: 'synthetic-token',
      readOnly,
    });
    expect(await client.getDocumentContent(1)).toBe('Synthetic text');
    expect(await client.getDocumentMetadata(1)).toMatchObject({ id: 1, title: 'Synthetic title' });
    expect(await client.getDocumentMetadata(1, 'files')).toMatchObject({
      originalSize: 12,
      hasArchive: false,
    });
    expect(await client.getTags()).toMatchObject([{ id: 2, name: 'Synthetic tag' }]);
  },
);

it.each([false, undefined])('keeps mutations enabled when readOnly is %s', async (readOnly) => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      requests.push(options?.method ?? 'GET');
      return options?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ id: 1, name: 'Synthetic value', slug: 'synthetic-value' });
    }),
  );
  const client = new PaperlessClient({
    url: 'https://paperless.example.test',
    token: 'synthetic-token',
    readOnly,
  });
  await client.updateDocument(1, { title: 'Synthetic title' });
  expect(await client.createCorrespondent('Synthetic value')).toMatchObject({ id: 1 });
  expect(await client.createDocumentType('Synthetic value')).toMatchObject({ id: 1 });
  expect(await client.createTag('Synthetic value')).toMatchObject({ id: 1 });
  await client.deleteDocument(1);
  await client.bulkEdit([1], 'delete', {});
  expect(requests).toEqual(['PATCH', 'POST', 'POST', 'POST', 'DELETE', 'POST']);
});
