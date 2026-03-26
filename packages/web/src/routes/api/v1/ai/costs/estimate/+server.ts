import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { estimateBatchCost, getAiConfig } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const documentCount = parseInt(url.searchParams.get('documentCount') ?? '0', 10);
  if (!documentCount || documentCount < 1) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'documentCount must be a positive integer');
  }

  const aiConfig = getAiConfig(locals.db);
  const estimate = estimateBatchCost(locals.db, aiConfig.model, documentCount);

  if (!estimate) {
    return apiError(ErrorCode.NOT_FOUND, 'No pricing data available for the configured model');
  }

  return apiSuccess(estimate);
};
