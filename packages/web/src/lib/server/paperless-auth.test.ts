import { describe, expect, it, vi } from 'vitest';
import { createPaperlessMediaUrl, requirePaperlessAuthorization } from './paperless-auth';

const config = {
  PAPERLESS_API_TOKEN: 'paperless-secret',
  PAPERLESS_USERNAME: '',
  PAPERLESS_PASSWORD: '',
} as App.Locals['config'];

function signedRequest(
  paperlessId: number,
  assetKind: 'thumb' | 'preview',
  issuedAt: number,
  overrides: { paperlessId?: number; assetKind?: 'thumb' | 'preview'; signature?: string } = {},
) {
  const signedPaperlessId = overrides.paperlessId ?? paperlessId;
  const signedAssetKind = overrides.assetKind ?? assetKind;
  const url = new URL(
    createPaperlessMediaUrl(signedPaperlessId, signedAssetKind, issuedAt),
    'http://localhost',
  );
  if (overrides.signature) {
    const expiresAt = url.searchParams.get('access')!.split('.')[0];
    url.searchParams.set('access', `${expiresAt}.${overrides.signature}`);
  }
  return new Request(url);
}

describe('Paperless media authorization', () => {
  it('invalidates issued links when process signing state is recreated', async () => {
    const original = await import('./paperless-auth');
    const now = 1_700_000_000_000;
    const url = original.createPaperlessMediaUrl(42, 'preview', now);
    const request = new Request(new URL(url, 'http://localhost'));
    const authorization = { paperlessId: 42, assetKind: 'preview' as const, now };
    expect(original.requirePaperlessAuthorization(request, config, authorization)).toBeNull();

    vi.resetModules();
    const restarted = await import('./paperless-auth');
    expect(restarted.requirePaperlessAuthorization(request, config, authorization)?.status).toBe(
      401,
    );
  });

  it('accepts a non-expired capability signed for the requested document and asset', () => {
    const now = 1_700_000_000_000;
    const request = signedRequest(42, 'thumb', now);

    expect(
      requirePaperlessAuthorization(request, config, {
        paperlessId: 42,
        assetKind: 'thumb',
        now,
      }),
    ).toBeNull();
  });

  it.each([
    ['expired', { issuedAt: 1_699_996_399_999 }],
    ['another document', { issuedAt: 1_700_000_000_000, paperlessId: 43 }],
    ['another asset kind', { issuedAt: 1_700_000_000_000, assetKind: 'preview' as const }],
    ['a tampered signature', { issuedAt: 1_700_000_000_000, signature: 'tampered' }],
  ])('rejects a capability for %s', async (_label, token) => {
    const now = 1_700_000_000_000;
    const { issuedAt, ...overrides } = token;
    const request = signedRequest(42, 'thumb', issuedAt, overrides);

    const response = requirePaperlessAuthorization(request, config, {
      paperlessId: 42,
      assetKind: 'thumb',
      now,
    });

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    });
  });

  it('continues to accept the configured authorization header', () => {
    const request = new Request('http://localhost/media', {
      headers: { Authorization: 'Token paperless-secret' },
    });

    expect(
      requirePaperlessAuthorization(request, config, {
        paperlessId: 42,
        assetKind: 'preview',
        now: 1_700_000_000_000,
      }),
    ).toBeNull();
  });

  it('rejects incorrect authorization values of different lengths', () => {
    for (const authorization of ['', 'Token short', `Token ${'x'.repeat(256)}`]) {
      const request = new Request('http://localhost/media', {
        headers: { Authorization: authorization },
      });
      expect(requirePaperlessAuthorization(request, config)?.status).toBe(401);
    }
  });

  it('continues to accept configured basic authorization', () => {
    const basicConfig = {
      ...config,
      PAPERLESS_API_TOKEN: '',
      PAPERLESS_USERNAME: 'synthetic-user',
      PAPERLESS_PASSWORD: 'synthetic-password',
    };
    const request = new Request('http://localhost/media', {
      headers: {
        Authorization: `Basic ${Buffer.from('synthetic-user:synthetic-password').toString('base64')}`,
      },
    });
    expect(requirePaperlessAuthorization(request, basicConfig)).toBeNull();
  });
});
