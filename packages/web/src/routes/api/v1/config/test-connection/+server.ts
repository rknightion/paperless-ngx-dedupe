import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { PaperlessClient, toPaperlessConfig } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  try {
    // Runtime connection settings are environment-owned. Never accept or
    // deserialize browser-supplied credentials on this endpoint.
    const config = toPaperlessConfig(locals.config);

    const client = new PaperlessClient(config);
    const connectionResult = await client.testConnection();

    if (connectionResult.success) {
      return apiSuccess({
        connected: true,
        version: connectionResult.version,
        documentCount: connectionResult.documentCount,
      });
    }

    return apiError(ErrorCode.BAD_GATEWAY, 'Connection test failed', undefined, 502);
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Unable to test connection', undefined, 502);
  }
};
