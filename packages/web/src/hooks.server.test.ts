import { beforeEach, expect, it, vi } from 'vitest';
import { parseConfig } from '@paperless-dedupe/core';

const runtime = vi.hoisted(() => ({ config: {} as Record<string, unknown> }));
vi.mock('./runtime.server', () => ({ getServerRuntime: async () => runtime }));
// Kit's sequence needs its request store; composing the handlers keeps every real guard in play.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence:
    (...handlers: ((input: unknown) => unknown)[]) =>
    ({ event, resolve }: { event: unknown; resolve: (event: unknown) => unknown }) => {
      const run = (index: number, current: unknown): unknown =>
        index === handlers.length
          ? resolve(current)
          : handlers[index]({ event: current, resolve: (next: unknown) => run(index + 1, next) });
      return run(0, event);
    },
}));

import { handle } from './hooks.server';

const environment = {
  PAPERLESS_URL: 'https://paperless.example.test',
  PAPERLESS_API_TOKEN: 'synthetic-paperless-token',
};

function configure(overrides: Record<string, string> = {}) {
  runtime.config = parseConfig({ ...environment, ...overrides }) as Record<string, unknown>;
}

async function send(
  url: string,
  {
    method = 'GET',
    headers = {},
    routeId = null,
    body,
  }: {
    method?: string;
    headers?: Record<string, string>;
    routeId?: string | null;
    body?: string;
  } = {},
) {
  const resolve = vi.fn(async () => new Response('resolved'));
  const event = {
    url: new URL(url),
    request: new Request(url, { method, headers, body }),
    route: { id: routeId },
    locals: {},
    platform: undefined,
  };
  const response = await handle({ event, resolve } as never);
  return { status: response.status, resolved: resolve.mock.calls.length === 1 };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('ORIGIN', '');
  configure();
});

it.each(['/api/v1/config', '/%61pi/v1/config', '/documents', '/documents/__data.json'])(
  'refuses an unconfigured public host on %s',
  async (path) => {
    const result = await send('https://rebound.example.test' + path, {
      headers: { host: 'rebound.example.test' },
    });
    expect(result).toEqual({ status: 403, resolved: false });
  },
);

it.each([
  'localhost:3000',
  '127.0.0.1:3000',
  '192.0.2.10:3000',
  '[::1]:3000',
  'dedupe',
  'dedupe:3000',
  'dedupe.local',
  'dedupe.lan',
  'dedupe.internal',
  'dedupe.home.arpa',
])('serves the private-style host %s', async (host) => {
  expect(await send(`https://${host}/documents`, { headers: { host } })).toEqual({
    status: 200,
    resolved: true,
  });
});

it('serves a public host named by ORIGIN or ALLOWED_HOSTS', async () => {
  vi.stubEnv('ORIGIN', 'https://dedupe.example.test');
  const fromOrigin = await send('https://dedupe.example.test/documents', {
    headers: { host: 'dedupe.example.test' },
  });
  expect(fromOrigin.resolved).toBe(true);
  vi.stubEnv('ORIGIN', '');
  configure({ ALLOWED_HOSTS: 'other.example.test, Dedupe.Example.Test' });
  const listed = await send('https://dedupe.example.test/documents', {
    headers: { host: 'dedupe.example.test:8443' },
  });
  expect(listed.resolved).toBe(true);
  const unlisted = await send('https://third.example.test/documents', {
    headers: { host: 'third.example.test' },
  });
  expect(unlisted.status).toBe(403);
});

it('applies the bearer check to a percent-encoded API path', async () => {
  configure({ APP_API_TOKEN: 'synthetic-app-token' });
  const result = await send('https://localhost:3000/%61pi/v1/config', {
    headers: { host: 'localhost:3000', authorization: 'Bearer wrong-token' },
    routeId: '/api/v1/config',
  });
  expect(result).toEqual({ status: 401, resolved: false });
});

it('applies write protection to a percent-encoded API path', async () => {
  const result = await send('https://localhost:3000/%61pi/v1/batch/purge-deleted', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'https://attacker.example.test',
      'content-type': 'application/json',
    },
    routeId: '/api/v1/batch/purge-deleted',
    body: '{}',
  });
  expect(result).toEqual({ status: 403, resolved: false });
});

it('accepts a same-host browser write over plain HTTP', async () => {
  const result = await send('https://dedupe:3000/api/v1/sync', {
    method: 'POST',
    headers: {
      host: 'dedupe:3000',
      origin: 'http://dedupe:3000',
      'content-type': 'application/json',
    },
    routeId: '/api/v1/sync',
    body: '{}',
  });
  expect(result).toEqual({ status: 200, resolved: true });
});

it.each([
  ['a different host', 'http://other:3000', 'application/json'],
  ['an empty Origin', '', 'application/json'],
  ['a lookalike media type', 'http://dedupe:3000', 'text/plain; x=application/json'],
])('refuses a write with %s', async (_name, origin, contentType) => {
  const result = await send('https://dedupe:3000/api/v1/sync', {
    method: 'POST',
    headers: { host: 'dedupe:3000', origin, 'content-type': contentType },
    routeId: '/api/v1/sync',
    body: '{}',
  });
  expect(result).toEqual({ status: 403, resolved: false });
});
