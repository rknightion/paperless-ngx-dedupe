import { getDataQualityInsights } from '@paperless-dedupe/core/queries/data-quality';
import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const response = apiSuccess(getDataQualityInsights(locals.db));
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch {
    const response = apiError(ErrorCode.INTERNAL_ERROR, {
      operation: 'get_data_quality_insights',
      retryable: true,
    });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
};
