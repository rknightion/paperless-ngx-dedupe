import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  applyAiResult,
  getAiConfig,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
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

  if (resultIds.length === 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'No result IDs provided');
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

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
