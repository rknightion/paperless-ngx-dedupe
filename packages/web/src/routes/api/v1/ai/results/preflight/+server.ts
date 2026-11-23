import { z } from 'zod';
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

const applyScopeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('selected_result_ids'),
    resultIds: z.array(z.string().min(1)).min(1).max(50_000),
  }),
  z.object({ type: z.literal('all_pending') }),
  z.object({ type: z.literal('current_filter'), filters: z.object({}).passthrough() }),
]);

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const body = await request.json();

  const parsedScope = applyScopeSchema.safeParse(body?.scope);
  if (!parsedScope.success) {
    return apiError(ErrorCode.BAD_REQUEST, 'scope is required');
  }
  const scope = parsedScope.data as ApplyScope;
  // A plan token is all batch-apply needs, so the bulk switch has to hold here.
  if (scope.type !== 'selected_result_ids' && !locals.config.AI_BULK_ALL_ENABLED) {
    return apiError(ErrorCode.UNAUTHORIZED, { operation: 'ai_preflight', retryable: false });
  }

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
