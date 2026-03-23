import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getConversation, deleteConversation } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  const conversation = getConversation(locals.db, params.id);
  if (!conversation) {
    return apiError(ErrorCode.NOT_FOUND, 'Conversation not found');
  }

  return apiSuccess(conversation);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  const deleted = deleteConversation(locals.db, params.id);
  if (!deleted) {
    return apiError(ErrorCode.NOT_FOUND, 'Conversation not found');
  }

  return apiSuccess({ deleted: true });
};
