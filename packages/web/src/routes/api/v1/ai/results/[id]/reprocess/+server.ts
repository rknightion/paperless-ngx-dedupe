import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  reprocessSingleResult,
  createInteractiveAiProvider,
  getAiConfig,
  PaperlessClient,
  toPaperlessConfig,
  CustomFieldPolicyError,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  if (!locals.config.AI_OPENAI_API_KEY && !locals.config.AI_OPENAI_BASE_URL) {
    return apiError(ErrorCode.BAD_REQUEST, 'OpenAI API key is not configured');
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  try {
    const provider = await createInteractiveAiProvider(
      locals.config.AI_OPENAI_API_KEY,
      aiConfig.model,
      {
        maxRetries: aiConfig.maxRetries,
        baseURL: locals.config.AI_OPENAI_BASE_URL,
        apiStyle: locals.config.AI_OPENAI_API_STYLE,
      },
    );

    const result = await reprocessSingleResult(locals.db, params.id, {
      provider,
      client,
      config: aiConfig,
    });

    return apiSuccess({ reprocessed: true, resultId: result.resultId });
  } catch (error) {
    if (error instanceof Error && error.name === 'AiResultNotReprocessableError') {
      return apiError(ErrorCode.CONFLICT, { operation: 'ai_reprocess', retryable: false });
    }
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
