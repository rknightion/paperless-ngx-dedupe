import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  reprocessSingleResult,
  createAiProvider,
  getAiConfig,
  markAiResultFailed,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  if (!locals.config.AI_OPENAI_API_KEY) {
    return apiError(ErrorCode.BAD_REQUEST, 'OpenAI API key is not configured');
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  try {
    const provider = await createAiProvider(
      locals.config.AI_OPENAI_API_KEY,
      aiConfig.model,
      aiConfig.maxRetries,
      aiConfig.flexProcessing,
    );

    const result = await reprocessSingleResult(locals.db, params.id, {
      provider,
      client,
      config: aiConfig,
    });

    return apiSuccess({ reprocessed: true, resultId: result.resultId });
  } catch (error) {
    const errMsg = (error as Error).message;
    try {
      markAiResultFailed(locals.db, params.id, errMsg);
    } catch {
      // DB update failed — original error already logged
    }
    if (errMsg.includes('not found')) {
      return apiError(ErrorCode.NOT_FOUND, errMsg);
    }
    return apiError(ErrorCode.INTERNAL_ERROR, errMsg);
  }
};
