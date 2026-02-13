import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { setPrimaryDocument } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  documentId: z.string().min(1),
});

export const PUT: RequestHandler = async ({ params, request, locals }) => {
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

  const updated = setPrimaryDocument(locals.db, params.id, result.data.documentId);

  if (!updated) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ groupId: params.id, documentId: result.data.documentId });
};
