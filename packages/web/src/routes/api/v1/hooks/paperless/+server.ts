import { getWebhookSyncSettings } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { decideAccess } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const settings = getWebhookSyncSettings(locals.sqlite);
  if (!settings.enabled) return apiError(ErrorCode.NOT_FOUND, { operation: 'webhook_sync' });
  if (
    !locals.config.APP_API_TOKEN ||
    !/^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '') ||
    !decideAccess(locals.config, 'POST', url.pathname, request.headers, '').allowed
  ) {
    return apiError(ErrorCode.UNAUTHORIZED, { operation: 'webhook_sync' });
  }
  const now = new Date();
  const requestedAt = now.toISOString();
  locals.sqlite
    .prepare(
      `INSERT INTO app_config (key, value, updated_at) VALUES ('hooks.syncRequestedAt', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(requestedAt, requestedAt);
  return apiSuccess(
    {
      accepted: true,
      syncNotBefore: new Date(now.getTime() + settings.quietSeconds * 1000).toISOString(),
    },
    undefined,
    202,
  );
};
