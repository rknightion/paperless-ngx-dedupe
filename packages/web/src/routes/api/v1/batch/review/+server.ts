import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { batchMarkReviewed } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1).max(1000),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid request body', result.error.issues);
  }

  const data = batchMarkReviewed(locals.db, result.data.groupIds);
  return apiSuccess(data);
};
