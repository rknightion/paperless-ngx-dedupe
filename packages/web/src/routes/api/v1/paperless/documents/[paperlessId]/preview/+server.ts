import { safeProxyContentType } from '$lib/server/security-headers';
import { apiError, ErrorCode } from '$lib/server/api';
import {
  buildPaperlessAuthHeaders,
  requirePaperlessAuthorization,
} from '$lib/server/paperless-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, request }) => {
  const paperlessId = Number(params.paperlessId);
  if (isNaN(paperlessId) || paperlessId <= 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'Invalid paperless document ID');
  }

  const config = locals.config;
  const unauthorized = requirePaperlessAuthorization(request, config, {
    paperlessId,
    assetKind: 'preview',
  });
  if (unauthorized) {
    return unauthorized;
  }
  const baseUrl = config.PAPERLESS_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/documents/${paperlessId}/preview/`;

  try {
    const upstream = await fetch(url, {
      headers: buildPaperlessAuthHeaders(config),
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
    }

    const contentType = safeProxyContentType(upstream.headers.get('Content-Type'), 'preview');
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': "sandbox; frame-ancestors 'self'",
        'X-Content-Type-Options': 'nosniff',
        ...(contentType === 'application/octet-stream'
          ? { 'Content-Disposition': 'attachment' }
          : {}),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};
