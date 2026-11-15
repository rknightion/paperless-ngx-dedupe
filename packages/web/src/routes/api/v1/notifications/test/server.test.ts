import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { parseConfig } from '@paperless-dedupe/core';
import { POST } from './+server';

it('delivers a synthetic test using only environment credentials and returns only delivery status', async () => {
  const requests: Array<{ authorization?: string; path?: string; body: unknown }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      authorization: request.headers.authorization,
      path: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    response.writeHead(204).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  try {
    const config = parseConfig({
      PAPERLESS_URL: 'https://paperless.example.test',
      PAPERLESS_API_TOKEN: 'synthetic-paperless-token',
      NOTIFY_URL: `http://127.0.0.1:${address.port}/environment-topic`,
      NOTIFY_FORMAT: 'apprise',
      NOTIFY_AUTH_HEADER: 'Bearer synthetic-environment-token',
      ORIGIN: 'https://app.example.test',
    });
    const response = await POST({
      locals: { config },
      request: new Request('http://localhost/api/v1/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          NOTIFY_URL: 'https://caller.example.test',
          NOTIFY_AUTH_HEADER: 'caller-token',
        }),
      }),
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { delivered: true, status: 204 } });
    expect(requests).toEqual([
      {
        authorization: 'Bearer synthetic-environment-token',
        path: '/environment-topic',
        body: {
          title: 'New duplicate groups',
          body: '0 new duplicate groups. 0 pending groups, including 0 high-confidence groups.\nhttps://app.example.test/duplicates',
          type: 'info',
        },
      },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
