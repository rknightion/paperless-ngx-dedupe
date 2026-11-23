import { getWebhookSyncSettings, requestWebhookSync } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { hasValidApiToken } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  const settings = getWebhookSyncSettings(locals.sqlite);
  if (!settings.enabled) return apiError(ErrorCode.NOT_FOUND, { operation: 'webhook_sync' });
  if (!hasValidApiToken(locals.config, request.headers)) {
    return apiError(ErrorCode.UNAUTHORIZED, { operation: 'webhook_sync' });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    /* Generic webhook payloads still request a full sync. */
  }
  const documentId =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'documentId' in payload &&
    typeof payload.documentId === 'number'
      ? payload.documentId
      : undefined;
  const now = new Date();
  requestWebhookSync(locals.sqlite, now, documentId);
  return apiSuccess(
    {
      accepted: true,
      syncNotBefore: new Date(now.getTime() + settings.quietSeconds * 1000).toISOString(),
    },
    undefined,
    202,
  );
};
