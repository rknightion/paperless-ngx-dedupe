import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  aiFieldSelectionSchema,
  createAiApplyPlan,
  getAiConfig,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { ApplyScope } from '@paperless-dedupe/core';
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

  const selection = aiFieldSelectionSchema.safeParse(body.selection);
  if (!selection.success) {
    return apiError(ErrorCode.BAD_REQUEST, 'A non-empty field selection is required');
  }

  const allowClearing = body.allowClearing === true;
  const createMissingEntities = body.createMissingEntities !== false;

  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);
  const aiConfig = getAiConfig(locals.db);

  const preflight = await createAiApplyPlan(locals.db, client, scope, selection.data, {
    allowClearing,
    createMissingEntities,
    processedTagName: aiConfig.processedTagName,
  });

  return apiSuccess(preflight);
};
