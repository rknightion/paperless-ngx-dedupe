import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { computeApplyPreflight, PaperlessClient, toPaperlessConfig } from '@paperless-dedupe/core';
import type { AiApplyField, ApplyScope } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const body = await request.json();

  if (!body?.scope) {
    return apiError(ErrorCode.BAD_REQUEST, 'scope is required');
  }

  const scope: ApplyScope = body.scope;

  let fields: AiApplyField[] = ['title', 'correspondent', 'documentType', 'tags'];
  if (Array.isArray(body.fields)) {
    fields = body.fields.filter((f: string) =>
      ['title', 'correspondent', 'documentType', 'tags', 'customFields'].includes(f),
    );
  }

  const allowClearing = body.allowClearing === true;
  const createMissingEntities = body.createMissingEntities !== false;

  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  const preflight = await computeApplyPreflight(locals.db, client, scope, {
    fields,
    allowClearing,
    createMissingEntities,
  });

  return apiSuccess(preflight);
};
