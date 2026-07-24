import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  JobType,
  OperationConflictError,
  getFailedDocumentIds,
  getDocumentIdsByAiFilter,
} from '@paperless-dedupe/core';
import type { ProcessScope } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
import { getServerRuntime } from '../../../../../runtime.server';
import { RuntimeUnavailableError } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let reprocess = false;
  let documentIds: string[] | undefined;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();

      // New structured scope takes precedence
      if (body?.scope) {
        const scope = body.scope as ProcessScope;
        const resolved = resolveScope(scope, locals.db);
        reprocess = resolved.reprocess;
        documentIds = resolved.documentIds;
      } else {
        // Legacy params
        reprocess = body?.reprocess === true;
        if (Array.isArray(body?.documentIds)) {
          documentIds = body.documentIds;
        }
      }
    } catch {
      // Ignore parse errors
    }
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

function resolveScope(
  scope: ProcessScope,
  db: Parameters<typeof getFailedDocumentIds>[0],
): { reprocess: boolean; documentIds?: string[] } {
  switch (scope.type) {
    case 'new_only':
      return { reprocess: false };
    case 'failed_only':
      return { reprocess: false, documentIds: getFailedDocumentIds(db) };
    case 'selected_document_ids':
      return { reprocess: false, documentIds: scope.documentIds };
    case 'current_filter':
      return { reprocess: false, documentIds: getDocumentIdsByAiFilter(db, scope.filters) };
    case 'full_reprocess':
      return { reprocess: true };
  }
}
