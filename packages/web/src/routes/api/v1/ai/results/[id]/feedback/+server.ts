import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { recordFeedback } from '@paperless-dedupe/core';
import type { AiFeedback } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();

  const feedback: AiFeedback = {
    action: body.action,
    rejectedFields: body.rejectedFields,
    corrections: body.corrections,
    reason: body.reason,
    timestamp: new Date().toISOString(),
  };

  if (!['rejected', 'corrected', 'partial_applied'].includes(feedback.action)) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid feedback action');
  }

  try {
    recordFeedback(locals.db, params.id, feedback);
    return apiSuccess({ recorded: true }, undefined, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record feedback';
    return apiError(ErrorCode.INTERNAL_ERROR, message);
  }
};
