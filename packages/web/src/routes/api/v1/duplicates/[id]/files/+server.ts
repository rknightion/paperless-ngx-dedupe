import {
  getDuplicateGroupFiles,
  PaperlessClient,
  PaperlessApiError,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const files = await getDuplicateGroupFiles(
      locals.db,
      params.id,
      new PaperlessClient(toPaperlessConfig(locals.config)),
    );
    return files
      ? apiSuccess(files)
      : apiError(ErrorCode.NOT_FOUND, { operation: 'get_duplicate_files', retryable: false });
  } catch (error) {
    return apiError(ErrorCode.BAD_GATEWAY, {
      operation: 'get_duplicate_files',
      retryable: !(error instanceof PaperlessApiError) || error.isRetryable,
    });
  }
};
