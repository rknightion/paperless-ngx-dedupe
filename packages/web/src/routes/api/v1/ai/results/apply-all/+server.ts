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

  let allowClearing = false;
  let createMissingEntities = true;
  let fields: ('title' | 'correspondent' | 'documentType' | 'tags')[] = [
    'title',
    'correspondent',
    'documentType',
    'tags',
  ];
  let scope: ApplyScope = { type: 'all_pending' };

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      allowClearing = body?.allowClearing === true;
      createMissingEntities = body?.createMissingEntities !== false;

      if (Array.isArray(body?.fields)) {
        fields = body.fields.filter((f: string) =>
          ['title', 'correspondent', 'documentType', 'tags'].includes(f),
        );
      }

      // Support filter-scoped apply-all
      if (body?.scope) {
        scope = body.scope;
      } else if (body?.filters) {
        scope = { type: 'current_filter', filters: body.filters };
      }
    } catch {
      // Use defaults
    }
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
