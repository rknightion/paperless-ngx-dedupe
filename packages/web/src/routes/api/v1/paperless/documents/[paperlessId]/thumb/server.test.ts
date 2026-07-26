import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const config = {
  PAPERLESS_URL: 'http://paperless.internal',
  PAPERLESS_API_TOKEN: 'paperless-secret',
  PAPERLESS_USERNAME: '',
  PAPERLESS_PASSWORD: '',
} as App.Locals['config'];

function accessFor(paperlessId: number, assetKind: 'thumb' | 'preview'): string {
  const expiresAt = Date.now() + 60_000;
  const signature = createHmac('sha256', 'Token paperless-secret')
    .update(`${paperlessId}:${assetKind}:${expiresAt}`)
    .digest('base64url');
  return `${expiresAt}.${signature}`;
}

describe('Paperless thumbnail proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a thumbnail to a browser request with a matching signed capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('thumbnail', {
          headers: { 'Content-Type': 'image/webp' },
        }),
      ),
    );
    const access = accessFor(42, 'thumb');

    const response = await GET({
      params: { paperlessId: '42' },
      locals: { config },
      request: new Request(`http://localhost/thumb?access=${access}`),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    await expect(response.text()).resolves.toBe('thumbnail');
  });

  it('does not accept a preview capability for the thumbnail endpoint', async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);
    const access = accessFor(42, 'preview');

    const response = await GET({
      params: { paperlessId: '42' },
      locals: { config },
      request: new Request(`http://localhost/thumb?access=${access}`),
    } as never);

    expect(response.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
