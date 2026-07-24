import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { reviewedMutationPlan } from '../schema/sqlite/review.js';
import { document } from '../schema/sqlite/documents.js';
import type { PaperlessClient } from '../paperless/client.js';
import type {
  PaperlessCustomFieldInstance,
  PaperlessDocument,
  DocumentUpdate,
} from '../paperless/types.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { aiApplyTotal } from '../telemetry/metrics.js';
import { aiFieldSelectionSchema, type AiFieldSelection } from './types.js';
import { REVIEWED_MUTATION_PLAN_TTL_MS, MutationPlanError } from '../review/mutation-plans.js';
import type {
  AiMutationExecutionResult,
  AiMutationPlanPayload,
  AiMutationPlanPreview,
  ClaimedAiMutationPlan,
} from './preflight.js';
import type { AppliedTagAudit } from './queries.js';
import { PaperlessApiError, PaperlessConnectionError } from '../paperless/errors.js';

const logger = createLogger('ai-revert');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function auditFields(selection: AiFieldSelection): string[] {
  return [
    ...(selection.title ? ['title'] : []),
    ...(selection.correspondent ? ['correspondent'] : []),
    ...(selection.documentType ? ['documentType'] : []),
    ...(selection.tags ? ['tags'] : []),
    ...(selection.processedTag ? ['processedTag'] : []),
    ...selection.customFieldIds.map((id) => `customField:${id}`),
  ];
}

function fieldSelectedForRevert(field: string, selection: AiFieldSelection): boolean {
  return (
    (field === 'title' && selection.title) ||
    (field === 'correspondent' && selection.correspondent) ||
    (field === 'documentType' && selection.documentType) ||
    (field === 'tags' && selection.tags) ||
    ((field === 'processedTag' || field.startsWith('processedTag:')) && selection.processedTag) ||
    selection.customFieldIds.some((id) => field === `customField:${id}`)
  );
}

function isTransientPaperlessFailure(error: unknown): boolean {
  return (
    (error instanceof PaperlessApiError && error.isRetryable) ||
    error instanceof PaperlessConnectionError ||
    (error instanceof Error &&
      /network|timeout|timed out|econn|enotfound|socket|fetch failed/i.test(error.message))
  );
}

function parsedTagIds(value: string | null): number[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as number[] | AppliedTagAudit;
  return [...(Array.isArray(parsed) ? parsed : parsed.after)].sort((a, b) => a - b);
}

function tagAudit(row: typeof aiProcessingResult.$inferSelect): AppliedTagAudit {
  const before = new Set(parsedTagIds(row.preApplyTagIdsJson));
  if (row.appliedTagIdsJson) {
    const parsed = JSON.parse(row.appliedTagIdsJson) as number[] | AppliedTagAudit;
    if (!Array.isArray(parsed)) return parsed;
  }
  const after = parsedTagIds(row.appliedTagIdsJson);
  const fields = row.appliedFieldsJson ? (JSON.parse(row.appliedFieldsJson) as string[]) : [];
  const exactProcessed = fields.find((field) => field.startsWith('processedTag:'));
  const processedTagId = exactProcessed
    ? Number(exactProcessed.slice('processedTag:'.length))
    : null;
  const legacyProcessedId =
    processedTagId ??
    (fields.includes('processedTag') ? (after.find((id) => !before.has(id)) ?? null) : null);
  return {
    after,
    tagAdded: after.filter((id) => !before.has(id) && id !== legacyProcessedId),
    tagRemoved: [...before].filter((id) => !after.includes(id)),
    processedTagId: legacyProcessedId,
    processedTagAdded: legacyProcessedId !== null && !before.has(legacyProcessedId),
  };
}

function relevantTagIds(selection: AiFieldSelection, audit: AppliedTagAudit): number[] {
  return [
    ...(selection.tags ? [...audit.tagAdded, ...audit.tagRemoved] : []),
    ...(selection.processedTag && audit.processedTagId !== null ? [audit.processedTagId] : []),
  ];
}

function selectedLiveState(
  live: PaperlessDocument,
  selection: AiFieldSelection,
  audit: AppliedTagAudit,
): AiMutationPlanPayload['results'][number]['reviewedState'] {
  const state: AiMutationPlanPayload['results'][number]['reviewedState'] = {};
  if (selection.title) state.title = live.title;
  if (selection.correspondent) state.correspondent = live.correspondent;
  if (selection.documentType) state.documentType = live.documentType;
  if (selection.tags || selection.processedTag) {
    const relevant = new Set(relevantTagIds(selection, audit));
    state.tags = live.tags.filter((id) => relevant.has(id)).sort((a, b) => a - b);
  }
  if (selection.customFieldIds.length > 0) {
    const ids = new Set(selection.customFieldIds);
    state.customFields = live.customFields
      .filter(({ field }) => ids.has(field))
      .map((field) => ({ ...field }))
      .sort((left, right) => left.field - right.field);
  }
  return state;
}

function appliedState(
  row: typeof aiProcessingResult.$inferSelect,
  selection: AiFieldSelection,
): AiMutationPlanPayload['results'][number]['reviewedState'] {
  const state: AiMutationPlanPayload['results'][number]['reviewedState'] = {};
  if (selection.title) state.title = row.appliedTitle ?? undefined;
  if (selection.correspondent) state.correspondent = row.appliedCorrespondentId;
  if (selection.documentType) state.documentType = row.appliedDocumentTypeId;
  if (selection.tags || selection.processedTag) {
    const audit = tagAudit(row);
    state.tags = [
      ...(selection.tags ? audit.tagAdded : []),
      ...(selection.processedTag && audit.processedTagAdded && audit.processedTagId !== null
        ? [audit.processedTagId]
        : []),
    ].sort((a, b) => a - b);
  }
  if (selection.customFieldIds.length > 0) {
    const ids = new Set(selection.customFieldIds);
    state.customFields = row.appliedCustomFieldsJson
      ? (JSON.parse(row.appliedCustomFieldsJson) as PaperlessCustomFieldInstance[])
          .filter(({ field }) => ids.has(field))
          .sort((left, right) => left.field - right.field)
      : [];
  }
  return state;
}

function revertVersion(
  row: typeof aiProcessingResult.$inferSelect,
  selection: AiFieldSelection,
): string {
  return stableHash({
    id: row.id,
    appliedAt: row.appliedAt,
    appliedFieldsJson: row.appliedFieldsJson,
    pre: {
      title: selection.title ? row.preApplyTitle : undefined,
      correspondent: selection.correspondent ? row.preApplyCorrespondentId : undefined,
      documentType: selection.documentType ? row.preApplyDocumentTypeId : undefined,
      tags: selection.tags || selection.processedTag ? row.preApplyTagIdsJson : undefined,
      customFields: selection.customFieldIds.length ? row.preApplyCustomFieldsJson : undefined,
    },
    applied: appliedState(row, selection),
  });
}

function preApplyState(
  row: typeof aiProcessingResult.$inferSelect,
  selection: AiFieldSelection,
): AiMutationPlanPayload['results'][number]['reviewedState'] {
  const state: AiMutationPlanPayload['results'][number]['reviewedState'] = {};
  if (selection.title) state.title = row.preApplyTitle ?? undefined;
  if (selection.correspondent) state.correspondent = row.preApplyCorrespondentId;
  if (selection.documentType) state.documentType = row.preApplyDocumentTypeId;
  if (selection.tags || selection.processedTag) {
    const audit = tagAudit(row);
    state.tags = [...(selection.tags ? audit.tagRemoved : [])].sort((a, b) => a - b);
  }
  if (selection.customFieldIds.length > 0) {
    const ids = new Set(selection.customFieldIds);
    state.customFields = row.preApplyCustomFieldsJson
      ? (JSON.parse(row.preApplyCustomFieldsJson) as PaperlessCustomFieldInstance[])
          .filter(({ field }) => ids.has(field))
          .sort((left, right) => left.field - right.field)
      : [];
  }
  return state;
}

export async function createAiRevertPlan(
  db: AppDatabase,
  client: PaperlessClient,
  requestedResultIds: readonly string[],
  rawSelection: AiFieldSelection,
  options: {
    now?: Date;
    ttlMs?: number;
    tokenFactory?: () => string;
  } = {},
): Promise<AiMutationPlanPreview> {
  const selection = aiFieldSelectionSchema.parse(rawSelection);
  const resultIds = [...new Set(requestedResultIds)];
  if (resultIds.length === 0) throw new Error('No AI results selected for revert');
  const results: AiMutationPlanPayload['results'] = [];
  for (const resultId of resultIds) {
    const row = db
      .select()
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.id, resultId))
      .get();
    if (!row || (row.appliedStatus !== 'applied' && row.appliedStatus !== 'partial')) {
      throw new Error(`AI result is not revertible: ${resultId}`);
    }
    const approved = new Set<string>(
      row.appliedFieldsJson ? JSON.parse(row.appliedFieldsJson) : [],
    );
    if (
      auditFields(selection).some((field) =>
        field === 'processedTag'
          ? ![...approved].some((approvedField) => approvedField.startsWith('processedTag:')) &&
            !approved.has('processedTag')
          : !approved.has(field),
      )
    ) {
      throw new Error(`AI revert selection includes a field that was not applied: ${resultId}`);
    }
    const live = await client.getDocument(row.paperlessId);
    const liveState = selectedLiveState(live, selection, tagAudit(row));
    if (JSON.stringify(liveState) !== JSON.stringify(appliedState(row, selection))) {
      throw new Error(`AI revert preview conflicts with live Paperless state: ${resultId}`);
    }
    results.push({
      resultId,
      resultVersion: revertVersion(row, selection),
      documentId: row.documentId,
      paperlessId: row.paperlessId,
      reviewedState: liveState,
    });
  }
  const now = options.now ?? new Date();
  const token = (options.tokenFactory ?? (() => nanoid(48)))();
  const expiresAt = new Date(
    now.getTime() + (options.ttlMs ?? REVIEWED_MUTATION_PLAN_TTL_MS),
  ).toISOString();
  const payload: AiMutationPlanPayload = {
    resultIds,
    selection,
    results,
    allowClearing: false,
    createMissingEntities: false,
  };
  db.insert(reviewedMutationPlan)
    .values({
      id: nanoid(),
      tokenHash: hashToken(token),
      operation: 'ai_revert',
      expiresAt,
      payloadJson: JSON.stringify(payload),
      consumedAt: null,
    })
    .run();
  return {
    token,
    expiresAt,
    resultIds,
    selection,
    preflight: {
      totalDocuments: resultIds.length,
      fieldsChanged: {
        title: selection.title ? resultIds.length : 0,
        correspondent: selection.correspondent ? resultIds.length : 0,
        documentType: selection.documentType ? resultIds.length : 0,
        tags: selection.tags || selection.processedTag ? resultIds.length : 0,
        customFields: selection.customFieldIds.length > 0 ? resultIds.length : 0,
      },
      newEntitiesCreated: { correspondents: [], documentTypes: [], tags: [] },
      lowConfidenceCount: 0,
      noOpCount: 0,
      destructiveClearCount: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
    },
  };
}

function mergeRevertedCustomFields(
  live: PaperlessCustomFieldInstance[],
  selectedIds: readonly number[],
  before: PaperlessCustomFieldInstance[],
): PaperlessCustomFieldInstance[] {
  const ids = new Set(selectedIds);
  const beforeById = new Map(before.map((field) => [field.field, field]));
  const restored: PaperlessCustomFieldInstance[] = [];
  const seen = new Set<number>();
  for (const field of live) {
    if (!ids.has(field.field)) {
      restored.push({ ...field });
      continue;
    }
    seen.add(field.field);
    const prior = beforeById.get(field.field);
    if (prior) restored.push({ ...prior });
  }
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    const prior = beforeById.get(id);
    if (prior) restored.push({ ...prior });
  }
  return restored;
}

async function syncRevertedLocalCache(
  db: AppDatabase,
  client: PaperlessClient,
  row: typeof aiProcessingResult.$inferSelect,
  live: PaperlessDocument,
  selection: AiFieldSelection,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (selection.title) update.title = live.title;
  if (selection.correspondent) {
    const correspondents = await client.getCorrespondents();
    update.correspondent = correspondents.find(({ id }) => id === live.correspondent)?.name ?? null;
  }
  if (selection.documentType) {
    const documentTypes = await client.getDocumentTypes();
    update.documentType = documentTypes.find(({ id }) => id === live.documentType)?.name ?? null;
  }
  if (selection.tags || selection.processedTag) {
    const tags = await client.getTags();
    update.tagsJson = JSON.stringify(
      live.tags
        .map((id) => tags.find((tag) => tag.id === id)?.name)
        .filter((name): name is string => name !== undefined),
    );
  }
  if (selection.customFieldIds.length > 0) {
    update.customFieldsJson = JSON.stringify(live.customFields);
  }
  if (Object.keys(update).length > 0) {
    db.update(document).set(update).where(eq(document.id, row.documentId)).run();
  }
}

export async function executeClaimedAiRevertPlan(
  db: AppDatabase,
  client: PaperlessClient,
  plan: ClaimedAiMutationPlan,
  jobId: string,
  options: { afterRemoteMutation?: (resultId: string) => void } = {},
): Promise<AiMutationExecutionResult> {
  if (plan.operation !== 'ai_revert') throw new MutationPlanError('operation_mismatch');
  const output: AiMutationExecutionResult = {
    applied: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
    total: plan.results.length,
    results: [],
  };
  for (const frozen of plan.results) {
    try {
      const row = db
        .select()
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, frozen.resultId))
        .get();
      const currentFields = row?.appliedFieldsJson
        ? (JSON.parse(row.appliedFieldsJson) as string[])
        : [];
      const selectedFieldsRemain = currentFields.some((field) =>
        fieldSelectedForRevert(field, plan.selection),
      );
      if (
        row &&
        (row.appliedStatus === 'reverted' ||
          (row.appliedStatus === 'partial' && !selectedFieldsRemain))
      ) {
        const live = await client.getDocument(row.paperlessId);
        const current = selectedLiveState(live, plan.selection, tagAudit(row));
        const before = preApplyState(row, plan.selection);
        if (JSON.stringify(current) !== JSON.stringify(before)) {
          output.conflicts++;
          output.results.push({
            resultId: frozen.resultId,
            status: 'conflict',
            conflictFields: ['reverted'],
          });
          continue;
        }
        await syncRevertedLocalCache(db, client, row, live, plan.selection);
        output.applied++;
        output.results.push({ resultId: row.id, status: 'applied' });
        continue;
      }
      if (
        !row ||
        (row.appliedStatus !== 'applied' && row.appliedStatus !== 'partial') ||
        revertVersion(row, plan.selection) !== frozen.resultVersion
      ) {
        output.conflicts++;
        output.results.push({
          resultId: frozen.resultId,
          status: 'conflict',
          conflictFields: ['audit'],
        });
        continue;
      }
      const live = await client.getDocument(row.paperlessId);
      const auditedTags = tagAudit(row);
      const liveState = selectedLiveState(live, plan.selection, auditedTags);
      const conflicts = Object.keys(frozen.reviewedState).filter(
        (field) =>
          JSON.stringify(liveState[field as keyof typeof liveState]) !==
          JSON.stringify(frozen.reviewedState[field as keyof typeof frozen.reviewedState]),
      );
      if (conflicts.length > 0) {
        const before = preApplyState(row, plan.selection);
        if (JSON.stringify(liveState) === JSON.stringify(before)) {
          const remainingFields = (
            row.appliedFieldsJson ? (JSON.parse(row.appliedFieldsJson) as string[]) : []
          ).filter((field) => !fieldSelectedForRevert(field, plan.selection));
          db.update(aiProcessingResult)
            .set({
              appliedStatus: remainingFields.length === 0 ? 'reverted' : 'partial',
              appliedFieldsJson: JSON.stringify(remainingFields),
              revertedAt: new Date().toISOString(),
            })
            .where(eq(aiProcessingResult.id, row.id))
            .run();
          await syncRevertedLocalCache(db, client, row, live, plan.selection);
          output.applied++;
          output.results.push({ resultId: row.id, status: 'applied' });
          continue;
        }
        output.conflicts++;
        output.results.push({
          resultId: frozen.resultId,
          status: 'conflict',
          conflictFields: conflicts,
        });
        continue;
      }
      const update: DocumentUpdate = {};
      if (plan.selection.title && row.preApplyTitle !== null) update.title = row.preApplyTitle;
      if (plan.selection.correspondent) update.correspondent = row.preApplyCorrespondentId;
      if (plan.selection.documentType) update.documentType = row.preApplyDocumentTypeId;
      if (plan.selection.tags || plan.selection.processedTag) {
        const removeIds = new Set([
          ...(plan.selection.tags ? auditedTags.tagAdded : []),
          ...(plan.selection.processedTag &&
          auditedTags.processedTagAdded &&
          auditedTags.processedTagId !== null
            ? [auditedTags.processedTagId]
            : []),
        ]);
        update.tags = live.tags.filter((id) => !removeIds.has(id));
        if (plan.selection.tags) {
          for (const id of auditedTags.tagRemoved) {
            if (!update.tags.includes(id)) update.tags.push(id);
          }
        }
      }
      if (plan.selection.customFieldIds.length > 0) {
        update.customFields = mergeRevertedCustomFields(
          live.customFields,
          plan.selection.customFieldIds,
          row.preApplyCustomFieldsJson ? JSON.parse(row.preApplyCustomFieldsJson) : [],
        );
      }
      await client.updateDocument(row.paperlessId, update);
      options.afterRemoteMutation?.(row.id);
      const remainingFields = (
        row.appliedFieldsJson ? (JSON.parse(row.appliedFieldsJson) as string[]) : []
      ).filter((field) => !fieldSelectedForRevert(field, plan.selection));
      db.update(aiProcessingResult)
        .set({
          appliedStatus: remainingFields.length === 0 ? 'reverted' : 'partial',
          appliedFieldsJson: JSON.stringify(remainingFields),
          revertedAt: new Date().toISOString(),
        })
        .where(eq(aiProcessingResult.id, row.id))
        .run();
      await syncRevertedLocalCache(
        db,
        client,
        row,
        {
          ...live,
          ...(update.title !== undefined ? { title: update.title } : {}),
          ...(update.correspondent !== undefined ? { correspondent: update.correspondent } : {}),
          ...(update.documentType !== undefined ? { documentType: update.documentType } : {}),
          ...(update.tags ? { tags: update.tags } : {}),
          ...(update.customFields ? { customFields: update.customFields } : {}),
        },
        plan.selection,
      );
      output.applied++;
      output.results.push({ resultId: row.id, status: 'applied' });
    } catch (error) {
      if (isTransientPaperlessFailure(error)) throw error;
      output.failed++;
      output.results.push({ resultId: frozen.resultId, status: 'failed' });
    }
  }
  const sqlite = (db as unknown as { $client: Database.Database }).$client;
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_plan
       SET completed_at = COALESCE(completed_at, ?), consumed_at = COALESCE(consumed_at, ?)
       WHERE id = ? AND claimed_by_job_id = ?`,
    )
    .run(new Date().toISOString(), new Date().toISOString(), plan.planId, jobId);
  return output;
}

export async function revertAiResult(
  db: AppDatabase,
  client: PaperlessClient,
  resultId: string,
): Promise<void> {
  return withSpan(
    'dedupe.ai.revert',
    {
      'ai.result_id': resultId,
    },
    async () => {
      const row = db
        .select()
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, resultId))
        .get();

      if (!row) throw new Error(`AI result not found: ${resultId}`);

      if (row.appliedStatus !== 'applied' && row.appliedStatus !== 'partial') {
        throw new Error(
          `Cannot revert: result status is '${row.appliedStatus}', expected 'applied' or 'partial'`,
        );
      }

      // Validate pre-apply snapshot exists
      const hasSnapshot =
        row.preApplyTitle !== null ||
        row.preApplyCorrespondentId !== null ||
        row.preApplyCorrespondentName !== null ||
        row.preApplyDocumentTypeId !== null ||
        row.preApplyDocumentTypeName !== null ||
        row.preApplyTagIdsJson !== null ||
        row.preApplyTagNamesJson !== null ||
        row.preApplyCustomFieldsJson !== null;

      if (!hasSnapshot) {
        throw new Error(
          'Cannot revert: no pre-apply snapshot exists (result was applied before audit tracking)',
        );
      }

      // Restore original state in Paperless
      const preApplyTagIds: number[] = row.preApplyTagIdsJson
        ? JSON.parse(row.preApplyTagIdsJson)
        : [];

      const preApplyCustomFields: PaperlessCustomFieldInstance[] | undefined =
        row.preApplyCustomFieldsJson ? JSON.parse(row.preApplyCustomFieldsJson) : undefined;

      const revertUpdate: DocumentUpdate = {
        correspondent: row.preApplyCorrespondentId ?? null,
        documentType: row.preApplyDocumentTypeId ?? null,
        tags: preApplyTagIds,
      };

      // Only revert title if we have a pre-apply title snapshot
      if (row.preApplyTitle) {
        revertUpdate.title = row.preApplyTitle;
      }
      if (preApplyCustomFields) {
        revertUpdate.customFields = preApplyCustomFields;
      }

      await client.updateDocument(row.paperlessId, revertUpdate);

      const localUpdate: Record<string, unknown> = {
        correspondent: row.preApplyCorrespondentName ?? null,
        documentType: row.preApplyDocumentTypeName ?? null,
        tagsJson: JSON.stringify(
          row.preApplyTagNamesJson ? JSON.parse(row.preApplyTagNamesJson) : [],
        ),
      };
      if (row.preApplyTitle) localUpdate.title = row.preApplyTitle;
      if (preApplyCustomFields) {
        localUpdate.customFieldsJson = JSON.stringify(preApplyCustomFields);
      }
      db.update(document).set(localUpdate).where(eq(document.paperlessId, row.paperlessId)).run();

      // Atomically update status to reverted
      const result = db
        .update(aiProcessingResult)
        .set({
          appliedStatus: 'reverted',
          revertedAt: new Date().toISOString(),
        })
        .where(eq(aiProcessingResult.id, resultId))
        .run();

      if (result.changes === 0) {
        throw new Error('Failed to update result status: concurrent modification');
      }

      aiApplyTotal().add(1, { status: 'reverted' });
      logger.info(
        { resultId, paperlessId: row.paperlessId },
        'Reverted AI result to pre-apply state',
      );
    },
  );
}
