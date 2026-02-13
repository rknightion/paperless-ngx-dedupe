import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { PaperlessClient, paperlessConfigSchema, toPaperlessConfig } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    let config;

    // Try to parse body, fall back to env vars
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const body = await request.json();
      // If body has url field, use it as explicit config
      if (body && body.url) {
        const result = paperlessConfigSchema.safeParse(body);
        if (!result.success) {
          return apiError(
            ErrorCode.VALIDATION_FAILED,
            'Invalid connection configuration',
            result.error.issues,
          );
        }
        config = result.data;
      }
    }

    // Fall back to env var config
    if (!config) {
      config = toPaperlessConfig(locals.config);
    }

    const client = new PaperlessClient(config);
    const connectionResult = await client.testConnection();

    if (connectionResult.success) {
      return apiSuccess({
        connected: true,
        version: connectionResult.version,
        documentCount: connectionResult.documentCount,
      });
    }

    return apiError(
      ErrorCode.INTERNAL_ERROR,
      connectionResult.error ?? 'Connection test failed',
      undefined,
      502,
    );
  } catch (error) {
    return apiError(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unexpected error during connection test',
      undefined,
      502,
    );
  }
};
