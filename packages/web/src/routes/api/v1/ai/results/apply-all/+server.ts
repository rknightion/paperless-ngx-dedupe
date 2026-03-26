import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  applyAiResult,
  getAiConfig,
  getPendingAiResultIds,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let allowClearing = false;
  let createMissingEntities = true;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      allowClearing = body?.allowClearing === true;
      createMissingEntities = body?.createMissingEntities !== false;
    } catch {
      // Use defaults
    }
  }

  const resultIds = getPendingAiResultIds(locals.db);

  if (resultIds.length === 0) {
    return apiSuccess({ applied: 0, failed: 0, total: 0 });
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  const fields: ('correspondent' | 'documentType' | 'tags')[] = [
    'correspondent',
    'documentType',
    'tags',
  ];

  let applied = 0;
  let failed = 0;

  for (const id of resultIds) {
    try {
      await applyAiResult(locals.db, client, id, {
        fields,
        allowClearing,
        createMissingEntities,
        addProcessedTag: aiConfig.addProcessedTag,
        processedTagName: aiConfig.processedTagName,
      });
      applied++;
    } catch {
      failed++;
    }
  }

  return apiSuccess({ applied, failed, total: resultIds.length });
};
