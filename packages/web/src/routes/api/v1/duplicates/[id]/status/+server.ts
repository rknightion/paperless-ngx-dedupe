import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { setGroupStatus, GROUP_STATUS_VALUES } from '@paperless-dedupe/core';
import type { GroupStatus } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  const { status } = body as { status?: string };

  if (!status || !GROUP_STATUS_VALUES.includes(status as GroupStatus)) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      `Invalid status. Must be one of: ${GROUP_STATUS_VALUES.join(', ')}`,
    );
  }

  const updated = setGroupStatus(locals.db, params.id, status as GroupStatus);

  if (!updated) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ groupId: params.id, status });
};
