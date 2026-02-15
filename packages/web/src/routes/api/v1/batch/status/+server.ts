import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { batchSetStatus, GROUP_STATUS_VALUES } from '@paperless-dedupe/core';
import type { GroupStatus } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1).max(1000),
  status: z.string().refine((s) => GROUP_STATUS_VALUES.includes(s as GroupStatus), {
    message: `Invalid status. Must be one of: ${GROUP_STATUS_VALUES.join(', ')}`,
  }),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid request body', result.error.issues);
  }

  const data = batchSetStatus(locals.db, result.data.groupIds, result.data.status as GroupStatus);
  return apiSuccess(data);
};
