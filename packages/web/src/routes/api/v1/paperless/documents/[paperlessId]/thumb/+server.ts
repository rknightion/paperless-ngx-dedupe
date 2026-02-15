import { apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const paperlessId = Number(params.paperlessId);
  if (isNaN(paperlessId) || paperlessId <= 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'Invalid paperless document ID');
  }

  const config = locals.config;
  const baseUrl = config.PAPERLESS_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/documents/${paperlessId}/thumb/`;

  const headers: Record<string, string> = {};
  if (config.PAPERLESS_API_TOKEN) {
    headers['Authorization'] = `Token ${config.PAPERLESS_API_TOKEN}`;
  } else if (config.PAPERLESS_USERNAME && config.PAPERLESS_PASSWORD) {
    const encoded = Buffer.from(
      `${config.PAPERLESS_USERNAME}:${config.PAPERLESS_PASSWORD}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  try {
    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'image/webp',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};
