import { sendNotification } from '@paperless-dedupe/core';
import { apiSuccess } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  const result = await sendNotification(locals.config, {
    event: 'duplicates.new',
    occurredAt: new Date().toISOString(),
    data: {
      jobId: 'test',
      jobType: 'test',
      newGroups: 0,
      pendingGroups: 0,
      highConfidencePending: 0,
    },
  });
  return apiSuccess(result);
};
