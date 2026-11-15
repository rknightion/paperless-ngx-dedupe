import { createPaperlessMediaUrl } from '$lib/server/paperless-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const config = {
  PAPERLESS_URL: 'http://paperless.internal',
  PAPERLESS_API_TOKEN: 'paperless-secret',
  PAPERLESS_USERNAME: '',
  PAPERLESS_PASSWORD: '',
} as App.Locals['config'];

describe('Paperless preview proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a PDF to a browser request with a matching signed capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('pdf', {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );
    const url = createPaperlessMediaUrl(42, 'preview');

    const response = await GET({
      params: { paperlessId: '42' },
      locals: { config },
      request: new Request(new URL(url, 'http://localhost')),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    await expect(response.text()).resolves.toBe('pdf');
  });
});
