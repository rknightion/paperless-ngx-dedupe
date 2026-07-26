import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requirePaperlessAuthorization } from './paperless-auth';

const config = {
  PAPERLESS_API_TOKEN: 'paperless-secret',
  PAPERLESS_USERNAME: '',
  PAPERLESS_PASSWORD: '',
} as App.Locals['config'];

function signedRequest(
  paperlessId: number,
  assetKind: 'thumb' | 'preview',
  expiresAt: number,
  overrides: { paperlessId?: number; assetKind?: 'thumb' | 'preview'; signature?: string } = {},
) {
  const signedPaperlessId = overrides.paperlessId ?? paperlessId;
  const signedAssetKind = overrides.assetKind ?? assetKind;
  const payload = `${signedPaperlessId}:${signedAssetKind}:${expiresAt}`;
  const signature =
    overrides.signature ??
    createHmac('sha256', 'Token paperless-secret').update(payload).digest('base64url');

  return new Request(`http://localhost/media?access=${expiresAt}.${signature}`);
}

describe('Paperless media authorization', () => {
  it('accepts a non-expired capability signed for the requested document and asset', () => {
    const now = 1_700_000_000_000;
    const request = signedRequest(42, 'thumb', now + 60_000);

    expect(
      requirePaperlessAuthorization(request, config, {
        paperlessId: 42,
        assetKind: 'thumb',
        now,
      }),
    ).toBeNull();
  });

  it.each([
    ['expired', { expiresAt: 1_699_999_999_999 }],
    ['another document', { expiresAt: 1_700_000_060_000, paperlessId: 43 }],
    ['another asset kind', { expiresAt: 1_700_000_060_000, assetKind: 'preview' as const }],
    ['a tampered signature', { expiresAt: 1_700_000_060_000, signature: 'tampered' }],
  ])('rejects a capability for %s', async (_label, token) => {
    const now = 1_700_000_000_000;
    const { expiresAt, ...overrides } = token;
    const request = signedRequest(42, 'thumb', expiresAt, overrides);

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
});
