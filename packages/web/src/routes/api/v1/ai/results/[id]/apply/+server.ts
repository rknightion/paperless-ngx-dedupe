import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  applyAiResult,
  getAiConfig,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let fields: ('correspondent' | 'documentType' | 'tags')[] = [
    'correspondent',
    'documentType',
    'tags',
  ];

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      if (Array.isArray(body?.fields)) {
        fields = body.fields.filter((f: string) =>
          ['correspondent', 'documentType', 'tags'].includes(f),
        );
      }
    } catch {
      // Use defaults
    }
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  try {
    await applyAiResult(locals.db, client, params.id, {
      fields,
      addProcessedTag: aiConfig.addProcessedTag,
      processedTagName: aiConfig.processedTagName,
    });
    return apiSuccess({ applied: true });
  } catch (error) {
    return apiError(ErrorCode.INTERNAL_ERROR, (error as Error).message);
  }
};
