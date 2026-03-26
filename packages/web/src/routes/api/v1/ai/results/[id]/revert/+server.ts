import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { revertAiResult, PaperlessClient, toPaperlessConfig } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  try {
    await revertAiResult(locals.db, client, params.id);
    return apiSuccess({ reverted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revert AI result';
    if (message.includes('not found')) {
      return apiError(ErrorCode.NOT_FOUND, message);
    }
    if (message.includes('Cannot revert') || message.includes('No pre-apply snapshot')) {
      return apiError(ErrorCode.BAD_REQUEST, message);
    }
    return apiError(ErrorCode.INTERNAL_ERROR, message);
  }
};
