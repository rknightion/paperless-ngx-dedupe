import { z } from 'zod';
import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

function buildAuthHeaders(config: App.Locals['config']): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.PAPERLESS_API_TOKEN) {
    headers['Authorization'] = `Token ${config.PAPERLESS_API_TOKEN}`;
  } else if (config.PAPERLESS_USERNAME && config.PAPERLESS_PASSWORD) {
    const encoded = Buffer.from(
      `${config.PAPERLESS_USERNAME}:${config.PAPERLESS_PASSWORD}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }
  return headers;
}

export const GET: RequestHandler = async ({ locals }) => {
  const config = locals.config;
  const baseUrl = config.PAPERLESS_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/trash/?page_size=1`;

  try {
    const upstream = await fetch(url, {
      headers: buildAuthHeaders(config),
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
    }

    const json = await upstream.json();
    return apiSuccess({ count: json.count ?? 0 });
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};

const bodySchema = z.object({
  action: z.literal('empty'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid request body');
  }

  const config = locals.config;
  const baseUrl = config.PAPERLESS_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/trash/`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'empty' }),
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
    }

    return apiSuccess({ emptied: true });
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};
