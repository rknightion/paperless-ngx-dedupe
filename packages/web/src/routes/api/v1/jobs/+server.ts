import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  listJobs,
  listJobHistory,
  getJobHistoryCounts,
  clearJobHistory,
  JobHistoryQueryError,
} from '@paperless-dedupe/core';
import type { JobType, JobStatus } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

function withoutInternalHistoryKey(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...value } as Record<string, unknown>;
  delete result.publicHistoryKey;
  return result;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const type = (url.searchParams.get('type') ?? undefined) as JobType | undefined;
  const status = (url.searchParams.get('status') ?? undefined) as JobStatus | undefined;
  const cursorMode = url.searchParams.has('pageSize') || url.searchParams.has('cursor');

  if (cursorMode) {
    const pageSizeRaw = url.searchParams.get('pageSize');
    const pageSize = pageSizeRaw === null ? 25 : Number(pageSizeRaw);
    const pageSizeSyntaxValid = pageSizeRaw === null || /^[1-9]\d{0,2}$/.test(pageSizeRaw);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const validTypes: readonly JobType[] = [
      'sync',
      'analysis',
      'batch_operation',
      'ai_processing',
      'ai_apply',
      'ai_revert',
      'custom_field_discovery',
    ];
    const validStatuses: readonly JobStatus[] = [
      'pending',
      'running',
      'paused',
      'completed',
      'failed',
      'cancelled',
    ];
    const issue =
      !pageSizeSyntaxValid || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
        ? { path: ['pageSize'], message: 'pageSize must be an integer between 1 and 100' }
        : type !== undefined && !validTypes.includes(type)
          ? { path: ['type'], message: `type must be one of: ${validTypes.join(', ')}` }
          : status !== undefined && !validStatuses.includes(status)
            ? { path: ['status'], message: `status must be one of: ${validStatuses.join(', ')}` }
            : null;
    if (issue) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        validationIssues: [issue],
        retryable: false,
      });
    }

    try {
      const page = listJobHistory(locals.db, {
        type,
        status,
        limit: pageSize,
        cursor,
      });
      return apiSuccess(page.items, {
        nextCursor: page.nextCursor,
        pageSize,
        filters: { type: type ?? null, status: status ?? null },
        counts: getJobHistoryCounts(locals.db),
      });
    } catch (error) {
      if (error instanceof JobHistoryQueryError) {
        return apiError(ErrorCode.VALIDATION_FAILED, {
          validationIssues: [{ path: ['cursor'], message: error.message }],
          retryable: false,
        });
      }
      return apiError(ErrorCode.INTERNAL_ERROR, {
        operation: 'job_history',
        retryable: true,
      });
    }
  }

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 200)) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'limit must be between 1 and 200');
  }

  const jobs = listJobs(locals.db, {
    type,
    status,
    limit,
  });

  return apiSuccess(jobs.map(withoutInternalHistoryKey));
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const deleted = clearJobHistory(locals.db);
  return apiSuccess({ deleted });
};
