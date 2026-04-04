import { apiError, ErrorCode } from '$lib/server/api';
import { getRagConfig, askDocuments } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  if (!locals.config.AI_OPENAI_API_KEY) {
    return apiError(ErrorCode.BAD_REQUEST, 'OpenAI API key is required for Document Q&A');
  }

  let body: { question?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.BAD_REQUEST, 'Invalid JSON body');
  }

  if (!body.question || typeof body.question !== 'string' || !body.question.trim()) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Question is required');
  }

  const config = getRagConfig(locals.db);

  try {
    const result = await askDocuments(locals.db, locals.sqlite, {
      question: body.question.trim(),
      conversationId: body.conversationId,
      config,
      openaiApiKey: locals.config.AI_OPENAI_API_KEY,
    });

    // Collect the full response text for saving
    const response = result.streamResult.toTextStreamResponse();

    // Add metadata headers
    response.headers.set('X-Conversation-Id', result.conversationId);
    response.headers.set('X-Sources', JSON.stringify(result.sources));

    // Save the response after streaming completes
    result.streamResult.text.then((text) => {
      result.streamResult.usage.then((usage) => {
        result.saveResponse(text, usage?.totalTokens);
      });
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process question';
    return apiError(ErrorCode.INTERNAL_ERROR, message);
  }
};
