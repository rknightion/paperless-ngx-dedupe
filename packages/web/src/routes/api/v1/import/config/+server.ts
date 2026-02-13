import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { importConfig } from '@paperless-dedupe/core';
import { ZodError } from 'zod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  try {
    const result = importConfig(locals.db, body);
    return apiSuccess(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid configuration backup', err.issues);
    }
    throw err;
  }
};
