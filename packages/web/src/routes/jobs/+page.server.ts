import { error } from '@sveltejs/kit';
import { listJobHistory, getJobHistoryCounts, JobHistoryQueryError } from '@paperless-dedupe/core';
import type { JobType, JobStatus } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const type = (url.searchParams.get('type') ?? undefined) as JobType | undefined;
  const status = (url.searchParams.get('status') ?? undefined) as JobStatus | undefined;
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
  if (
    (type !== undefined && !validTypes.includes(type)) ||
    (status !== undefined && !validStatuses.includes(status)) ||
    !pageSizeSyntaxValid ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    error(400, 'Invalid job history filters');
  }

  try {
    const page = listJobHistory(locals.db, { type, status, limit: pageSize, cursor });
    return {
      jobs: page.items,
      nextCursor: page.nextCursor,
      counts: getJobHistoryCounts(locals.db),
      filters: { type: type ?? null, status: status ?? null, pageSize },
    };
  } catch (cause) {
    if (cause instanceof JobHistoryQueryError) error(400, 'Invalid job history cursor');
    error(500, 'Unable to load job history');
  }
};
