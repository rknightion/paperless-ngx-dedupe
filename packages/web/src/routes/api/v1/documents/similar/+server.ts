import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import {
  findSimilarDocuments,
  similarDocumentInputSchema,
  SimilarDocumentNotFoundError,
  SimilarDocumentValidationError,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'find_similar_documents' });
  }
  const parsed = similarDocumentInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'find_similar_documents',
      validationIssues: parsed.error.issues,
    });
  }
  try {
    const result = findSimilarDocuments(locals.db, parsed.data);
    return apiSuccess(result.data, { compared: result.compared });
  } catch (error) {
    if (error instanceof SimilarDocumentNotFoundError) {
      return apiError(ErrorCode.NOT_FOUND, {
        operation: 'find_similar_documents',
        validationIssues: [{ path: ['paperlessId'], message: error.message }],
      });
    }
    if (error instanceof SimilarDocumentValidationError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'find_similar_documents',
        validationIssues: [{ path: ['text'], message: error.message }],
      });
    }
    throw error;
  }
};
