import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { rejectAiResult, rejectAiResultWithReason } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  let reason: string | undefined;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      reason = typeof body?.reason === 'string' ? body.reason : undefined;
    } catch {
      // Use defaults
    }
  }

  const outcome = reason
    ? rejectAiResultWithReason(locals.db, params.id, reason)
    : rejectAiResult(locals.db, params.id);
  if (outcome === 'not_rejectable') {
    return apiError(ErrorCode.CONFLICT, 'AI result is not awaiting review');
  }

  return apiSuccess({ rejected: true });
};
