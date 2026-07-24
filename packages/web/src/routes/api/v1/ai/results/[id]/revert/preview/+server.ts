import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  aiFieldSelectionSchema,
  createAiRevertPlan,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }
  const body = await request.json();
  const selection = aiFieldSelectionSchema.safeParse(body?.selection);
  if (!selection.success) {
    return apiError(ErrorCode.BAD_REQUEST, 'A non-empty field selection is required');
  }
  try {
    const preview = await createAiRevertPlan(
      locals.db,
      new PaperlessClient(toPaperlessConfig(locals.config)),
      [params.id],
      selection.data,
    );
    return apiSuccess(preview);
  } catch {
    return apiError(ErrorCode.CONFLICT, { operation: 'ai_revert_preview', retryable: true }, 409);
  }
};
