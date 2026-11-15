import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, safeProxyContentType } from './security-headers';

describe('security response policy', () => {
  it('preserves a stricter existing policy and the response body and status', async () => {
    const response = applySecurityHeaders(
      new Response('body', {
        status: 201,
        headers: { 'Content-Security-Policy': "sandbox; frame-ancestors 'self'" },
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('body');
    expect(response.headers.get('Content-Security-Policy')).toBe("sandbox; frame-ancestors 'self'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('rebuilds immutable responses without losing their redirect', () => {
    const response = applySecurityHeaders(
      Response.redirect('https://example.invalid/document', 302),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://example.invalid/document');
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });
});

describe('proxy content types', () => {
  it.each([
    ['application/pdf; charset=utf-8', 'preview', 'application/pdf'],
    ['application/pdf', 'thumb', 'application/octet-stream'],
    ['IMAGE/PNG; charset=utf-8', 'thumb', 'image/png'],
    ['image/jpeg', 'preview', 'image/jpeg'],
    ['image/webp', 'thumb', 'image/webp'],
    ['image/gif', 'preview', 'image/gif'],
    ['image/tiff', 'thumb', 'image/tiff'],
    ['image/svg+xml', 'preview', 'application/octet-stream'],
    ['text/html', 'thumb', 'application/octet-stream'],
    [null, 'preview', 'application/octet-stream'],
  ] as const)('maps %s for %s to %s', (input, kind, expected) => {
    expect(safeProxyContentType(input, kind)).toBe(expected);
  });
});
