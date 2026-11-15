import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { JobType, OperationConflictError, resolveProcessScope } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getServerRuntime } from '../../../../../runtime.server';
import { RuntimeUnavailableError } from '$lib/server/scheduler';

const processBodySchema = z.object({
  scope: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('new_only') }),
      z.object({ type: z.literal('failed_only') }),
      z.object({ type: z.literal('full_reprocess') }),
      z.object({
        type: z.literal('selected_document_ids'),
        documentIds: z.array(z.string().min(1)).min(1).max(50_000),
      }),
      z.object({ type: z.literal('current_filter'), filters: z.object({}).passthrough() }),
    ])
    .optional(),
  reprocess: z.boolean().optional(),
  documentIds: z.array(z.string()).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let reprocess = false;
  let documentIds: string[] | undefined;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const parsed = processBodySchema.safeParse(await request.json());
      if (!parsed.success) return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid process scope');
      const body = parsed.data;
      if (body.scope) {
        const resolved = resolveProcessScope(locals.db, body.scope);
        reprocess = resolved.reprocess;
        documentIds = resolved.documentIds;
      } else {
        reprocess = body.reprocess ?? false;
        documentIds = body.documentIds;
      }
    } catch {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid process request');
    }
  }
  if (documentIds !== undefined && documentIds.length === 0) {
    return apiSuccess({ jobId: null, nothingToDo: true });
  }

  const runtime = await getServerRuntime();
  try {
    const intent = runtime.enqueueManual('ai_processing', JobType.AI_PROCESSING, {
      reprocess,
      documentIds,
    });
    await runtime.dispatchPending();
    return apiSuccess({ jobId: intent.jobId }, undefined, 202);
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'manual_ai_processing', retryable: true },
        503,
      );
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }
};
