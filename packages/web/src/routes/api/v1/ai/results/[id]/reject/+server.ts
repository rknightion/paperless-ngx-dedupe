import { apiSuccess } from '$lib/server/api';
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

  if (reason) {
    rejectAiResultWithReason(locals.db, params.id, reason);
  } else {
    rejectAiResult(locals.db, params.id);
  }

  return apiSuccess({ rejected: true });
};
