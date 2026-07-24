import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { getAiConfig } from '../../ai/config.js';
import { createAiProvider } from '../../ai/providers/factory.js';
import { processBatch } from '../../ai/batch.js';
import {
  abandonAiReservations,
  countAiPromptTokens,
  reconcileAiBudgetReservation,
  reserveAiBudget,
  UnknownAiModelPricingError,
} from '../../ai/budget.js';
import { getExactModelPricing } from '../../ai/costs.js';
import type { AiRequestBudget } from '../../ai/extract.js';
import { getAutomationSettings } from '../../scheduler/settings.js';

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient({ ...paperlessConfig, timeout: 120_000 });

  const aiConfig = getAiConfig(ctx.db);
  const taskData = ctx.taskData as
    | {
        reprocess?: boolean;
        documentIds?: string[];
        syncGenerationId?: string;
      }
    | undefined;

  const apiKey = config.AI_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('No OpenAI API key configured (AI_OPENAI_API_KEY)');
  }

  const dispatch = ctx.sqlite
    .prepare(
      `SELECT id, trigger_kind AS triggerKind
       FROM dispatch_intent WHERE job_id = ?`,
    )
    .get(ctx.jobId) as { id: string; triggerKind: string } | undefined;
  const scheduled = Boolean(dispatch && dispatch.triggerKind !== 'manual');
  let requestBudget: AiRequestBudget | undefined;
  let maxDocuments: number | undefined;
  if (scheduled && dispatch) {
    const ownerToken = ctx.executionToken ?? ctx.jobId;
    const settings = getAutomationSettings(ctx.sqlite);
    const schedule = ctx.sqlite
      .prepare(`SELECT id, enabled FROM automation_schedule WHERE task = 'ai_processing'`)
      .get() as { id: string; enabled: number } | undefined;
    if (!schedule?.enabled) throw new Error('Scheduled AI processing is not enabled');
    maxDocuments = settings.ai.maxDocumentsPerRun;
    const pricing = getExactModelPricing(ctx.db, aiConfig.model);
    if (!pricing) throw new UnknownAiModelPricingError();
    abandonAiReservations(ctx.sqlite, {
      dispatchIntentId: dispatch.id,
      currentOwnerToken: ownerToken,
    });
    requestBudget = {
      async reserve(request) {
        const promptTokens = await countAiPromptTokens(
          request.extractionRequest,
          aiConfig.model,
          aiConfig.flexProcessing,
        );
        return reserveAiBudget(ctx.sqlite, {
          dispatchIntentId: dispatch.id,
          scheduleId: schedule.id,
          requestKey: `${dispatch.id}:${request.requestKey}:${ownerToken}`,
          ownerToken,
          model: aiConfig.model,
          pricing,
          promptTokens,
          maxOutputTokens: request.extractionRequest.maxOutputTokens ?? aiConfig.maxOutputTokens,
          monthlyBudgetUsd: settings.ai.monthlyBudgetUsd,
        });
      },
      async reconcile(reservation, usage) {
        reconcileAiBudgetReservation(ctx.sqlite, reservation.id, usage);
      },
    };
  }

  // Scheduled calls must surface every provider attempt to the application-level
  // reservation/retry loop. Manual work retains the configured SDK retry cap.
  const batchMaxRetries = scheduled ? 0 : Math.min(aiConfig.maxRetries, 2);
  const provider = await createAiProvider(
    apiKey,
    aiConfig.model,
    batchMaxRetries,
    aiConfig.flexProcessing,
  );

  const result = await processBatch(ctx.db, {
    provider,
    client,
    config: aiConfig,
    reprocess: taskData?.reprocess,
    documentIds: taskData?.documentIds,
    syncGenerationId: taskData?.syncGenerationId,
    maxDocuments,
    requestBudget,
    onProgress,
  });

  return result;
});
