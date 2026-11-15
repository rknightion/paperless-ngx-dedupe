export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
};

/** Add the baseline response policy while preserving stricter route-specific headers. */
export function applySecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (response.headers.has(name)) continue;
    try {
      response.headers.set(name, value);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      response = new Response(response.body, response);
      response.headers.set(name, value);
    }
  }
  return response;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff'];

/** Restrict inline media to document and raster-image formats supported by the UI. */
export function safeProxyContentType(upstream: string | null, kind: 'preview' | 'thumb'): string {
  const type = upstream?.split(';', 1)[0].trim().toLowerCase();
  if (type && (IMAGE_TYPES.includes(type) || (kind === 'preview' && type === 'application/pdf'))) {
    return type;
  }
  return 'application/octet-stream';
}
