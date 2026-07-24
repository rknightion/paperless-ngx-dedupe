import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  reprocessSingleResult,
  createAiProvider,
  getAiConfig,
  markAiResultFailed,
  PaperlessClient,
  toPaperlessConfig,
  CustomFieldPolicyError,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, url }) => {
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
    if (error instanceof CustomFieldPolicyError) {
      return apiError(
        ErrorCode.CONFLICT,
        {
          operation: 'ai_reprocess',
          retryable: false,
          validationIssues: [
            {
              path: ['customFields', error.fieldId ?? 'policy'],
              message: error.code,
            },
          ],
        },
        409,
      );
    }
    const errMsg = (error as Error).message;
    try {
      markAiResultFailed(locals.db, params.id, errMsg);
    } catch {
      // DB update failed — original error already logged
    }
    if (url.searchParams.get('mode') === 'inbox') {
      return apiError(
        errMsg.includes('not found') ? ErrorCode.NOT_FOUND : ErrorCode.INTERNAL_ERROR,
        {
          operation: 'ai_reprocess',
          retryable: !errMsg.includes('not found'),
        },
        errMsg.includes('not found') ? 404 : 500,
      );
    }
    if (errMsg.includes('not found')) {
      return apiError(ErrorCode.NOT_FOUND, errMsg);
    }
    return apiError(ErrorCode.INTERNAL_ERROR, errMsg);
  }
};
