import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  createJob,
  JobAlreadyRunningError,
  JobType,
  launchWorker,
  getWorkerPath,
} from '@paperless-dedupe/core';
import type { ApplyScope } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const body = await request.json();
  const resultIds: string[] = body?.resultIds ?? [];
  let fields: ('correspondent' | 'documentType' | 'tags')[] = [
    'correspondent',
    'documentType',
    'tags',
  ];

  if (Array.isArray(body?.fields)) {
    fields = body.fields.filter((f: string) =>
      ['correspondent', 'documentType', 'tags'].includes(f),
    );
  }

  const allowClearing = body?.allowClearing === true;
  const createMissingEntities = body?.createMissingEntities !== false;

  // Support both explicit scope and legacy resultIds
  let scope: ApplyScope;
  if (body?.scope) {
    scope = body.scope;
  } else {
    if (resultIds.length === 0) {
      return apiError(ErrorCode.BAD_REQUEST, 'No result IDs provided');
    }
    scope = { type: 'selected_result_ids', resultIds };
  }

  let jobId: string;
  try {
    jobId = createJob(locals.db, JobType.AI_APPLY);
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }

  const workerPath = getWorkerPath('ai-apply-worker');
  launchWorker({
    jobId,
    dbPath: locals.config.DATABASE_URL,
    workerScriptPath: workerPath,
    taskData: { scope, fields, allowClearing, createMissingEntities },
  });

  return apiSuccess({ jobId }, undefined, 202);
};
