import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { PaperlessDocument } from '../paperless/types.js';
import type { AppDatabase } from '../db/client.js';
import { reviewedMutationPlan } from '../schema/sqlite/review.js';
import { resolveResultIdsForApplyScope } from './scopes.js';
import type { ApplyScope } from './scopes.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { getAiConfig } from './config.js';
import { evaluateGates } from './gates.js';
import type { GateInput } from './gates.js';
import type { AiApplyField } from './apply.js';
import { AiApplyConflictError, applyAiResult } from './apply.js';
import { finalizeStartedAiApply, type AppliedTagAudit } from './queries.js';
import { aiFieldSelectionSchema, type AiFieldSelection } from './types.js';
import { MutationPlanError, REVIEWED_MUTATION_PLAN_TTL_MS } from '../review/mutation-plans.js';
import { PaperlessApiError, PaperlessConnectionError } from '../paperless/errors.js';

export interface ApplyPreflightResult {
  totalDocuments: number;
  fieldsChanged: {
    title: number;
    correspondent: number;
    documentType: number;
    tags: number;
    customFields: number;
  };
  newEntitiesCreated: {
    correspondents: string[];
    documentTypes: string[];
    tags: string[];
  };
  lowConfidenceCount: number;
  noOpCount: number;
  destructiveClearCount: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

type FrozenReviewedState = {
  title?: string;
  correspondent?: number | null;
  documentType?: number | null;
  tags?: number[];
  customFields?: Array<{ field: number; value: unknown }>;
};

type FrozenAiResult = {
  resultId: string;
  resultVersion: string;
  documentId: string;
  paperlessId: number;
  reviewedState: FrozenReviewedState;
};

const frozenReviewedStateSchema = z.object({
  title: z.string().optional(),
  correspondent: z.number().int().nullable().optional(),
  documentType: z.number().int().nullable().optional(),
  tags: z.array(z.number().int()).optional(),
  customFields: z.array(z.object({ field: z.number().int(), value: z.unknown() })).optional(),
});

const aiMutationPayloadSchema = z.object({
  resultIds: z.array(z.string().min(1)).min(1),
  selection: aiFieldSelectionSchema,
  results: z.array(
    z.object({
      resultId: z.string().min(1),
      resultVersion: z.string().length(64),
      documentId: z.string().min(1),
      paperlessId: z.number().int().nonnegative(),
      reviewedState: frozenReviewedStateSchema,
    }),
  ),
  allowClearing: z.boolean(),
  createMissingEntities: z.boolean(),
});

export type AiMutationPlanPayload = z.infer<typeof aiMutationPayloadSchema>;
export type ClaimedAiMutationPlan = AiMutationPlanPayload & {
  planId: string;
  operation: 'ai_apply' | 'ai_revert';
};

export interface AiMutationPlanPreview {
  token: string;
  expiresAt: string;
  resultIds: string[];
  selection: AiFieldSelection;
  preflight: ApplyPreflightResult;
}

export interface AiMutationExecutionResult {
  applied: number;
  skipped: number;
  conflicts: number;
  failed: number;
  total: number;
  results: Array<{
    resultId: string;
    status: 'applied' | 'skipped' | 'conflict' | 'failed';
    conflictFields?: string[];
  }>;
}

function isTransientPaperlessFailure(error: unknown): boolean {
  return (
    (error instanceof PaperlessApiError && error.isRetryable) ||
    error instanceof PaperlessConnectionError ||
    (error instanceof Error &&
      /network|timeout|timed out|econn|enotfound|socket|fetch failed/i.test(error.message))
  );
}

function sqliteFor(db: AppDatabase): Database.Database {
  const sqlite = (db as unknown as { $client?: Database.Database }).$client;
  if (!sqlite) throw new Error('AppDatabase does not expose its SQLite client');
  return sqlite;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function selectedState(
  document: PaperlessDocument,
  selection: AiFieldSelection,
  processedTagId: number | null = null,
): FrozenReviewedState {
  const state: FrozenReviewedState = {};
  if (selection.title) state.title = document.title;
  if (selection.correspondent) state.correspondent = document.correspondent;
  if (selection.documentType) state.documentType = document.documentType;
  if (selection.tags) {
    state.tags = [...document.tags].sort((a, b) => a - b);
  } else if (selection.processedTag) {
    state.tags =
      processedTagId !== null && document.tags.includes(processedTagId) ? [processedTagId] : [];
  }
  if (selection.customFieldIds.length > 0) {
    const selectedIds = new Set(selection.customFieldIds);
    state.customFields = document.customFields
      .filter(({ field }) => selectedIds.has(field))
      .map((field) => ({ ...field }))
      .sort((left, right) => left.field - right.field);
  }
  return state;
}

function selectedSuggestionVersion(
  row: typeof aiProcessingResult.$inferSelect,
  selection: AiFieldSelection,
): string {
  const customFieldIds = new Set(selection.customFieldIds);
  const customFields = row.suggestedCustomFieldsJson
    ? (JSON.parse(row.suggestedCustomFieldsJson) as Array<{ fieldId: number; value: unknown }>)
        .filter(({ fieldId }) => customFieldIds.has(fieldId))
        .sort((left, right) => left.fieldId - right.fieldId)
    : [];
  return stableHash({
    id: row.id,
    createdAt: row.createdAt,
    syncGenerationId: row.syncGenerationId,
    status: row.appliedStatus,
    title: selection.title ? row.suggestedTitle : undefined,
    correspondent: selection.correspondent ? row.suggestedCorrespondent : undefined,
    documentType: selection.documentType ? row.suggestedDocumentType : undefined,
    tags: selection.tags ? row.suggestedTagsJson : undefined,
    processedTag: selection.processedTag,
    customFields,
  });
}

function isReviewableAiResult(row: typeof aiProcessingResult.$inferSelect): boolean {
  return (
    row.appliedStatus === 'pending_review' ||
    (row.appliedStatus === 'failed' && row.failureType === 'review_conflict')
  );
}

function fieldsForSelection(selection: AiFieldSelection): AiApplyField[] {
  const fields: AiApplyField[] = [];
  if (selection.title) fields.push('title');
  if (selection.correspondent) fields.push('correspondent');
  if (selection.documentType) fields.push('documentType');
  if (selection.tags) fields.push('tags');
  if (selection.customFieldIds.length > 0) fields.push('customFields');
  return fields;
}

function auditFieldsForSelection(selection: AiFieldSelection): string[] {
  return [
    ...fieldsForSelection(selection).filter((field) => field !== 'customFields'),
    ...(selection.processedTag ? ['processedTag'] : []),
    ...selection.customFieldIds.map((id) => `customField:${id}`),
  ];
}

export async function createAiApplyPlan(
  db: AppDatabase,
  client: PaperlessClient,
  scope: ApplyScope,
  rawSelection: AiFieldSelection,
  options: {
    allowClearing?: boolean;
    createMissingEntities?: boolean;
    now?: Date;
    ttlMs?: number;
    tokenFactory?: () => string;
    processedTagName?: string;
  } = {},
): Promise<AiMutationPlanPreview> {
  const selection = aiFieldSelectionSchema.parse(rawSelection);
  const resultIds = [...new Set(resolveResultIdsForApplyScope(db, scope))];
  if (resultIds.length === 0) throw new Error('No AI results matched the reviewed scope');

  const rows = new Map<string, typeof aiProcessingResult.$inferSelect>();
  for (let offset = 0; offset < resultIds.length; offset += 400) {
    for (const row of db
      .select()
      .from(aiProcessingResult)
      .where(inArray(aiProcessingResult.id, resultIds.slice(offset, offset + 400)))
      .all()) {
      rows.set(row.id, row);
    }
  }
  if (rows.size !== resultIds.length) throw new Error('One or more AI results no longer exist');

  const processedTagId = selection.processedTag
    ? ((await client.getTags()).find(
        (tag) =>
          tag.name.toLowerCase() === (options.processedTagName ?? 'ai-processed').toLowerCase(),
      )?.id ?? null)
    : null;
  const frozenResults: FrozenAiResult[] = [];
  for (const resultId of resultIds) {
    const row = rows.get(resultId)!;
    if (!isReviewableAiResult(row)) {
      throw new Error(`AI result is not pending review: ${resultId}`);
    }
    const live = await client.getDocument(row.paperlessId);
    frozenResults.push({
      resultId,
      resultVersion: selectedSuggestionVersion(row, selection),
      documentId: row.documentId,
      paperlessId: row.paperlessId,
      reviewedState: selectedState(live, selection, processedTagId),
    });
  }

  const allowClearing = options.allowClearing ?? false;
  const createMissingEntities = options.createMissingEntities ?? true;
  const preflight = await computeApplyPreflight(
    db,
    client,
    {
      type: 'selected_result_ids',
      resultIds,
    },
    {
      fields: fieldsForSelection(selection),
      allowClearing,
      createMissingEntities,
    },
  );
  const now = options.now ?? new Date();
  const token = (options.tokenFactory ?? (() => nanoid(48)))();
  const expiresAt = new Date(
    now.getTime() + (options.ttlMs ?? REVIEWED_MUTATION_PLAN_TTL_MS),
  ).toISOString();
  const payload: AiMutationPlanPayload = {
    resultIds,
    selection,
    results: frozenResults,
    allowClearing,
    createMissingEntities,
  };
  db.insert(reviewedMutationPlan)
    .values({
      id: nanoid(),
      tokenHash: hashToken(token),
      operation: 'ai_apply',
      expiresAt,
      payloadJson: JSON.stringify(payload),
      consumedAt: null,
    })
    .run();
  return { token, expiresAt, resultIds, selection, preflight };
}

export function claimAiMutationPlan(
  db: AppDatabase,
  token: string,
  operation: 'ai_apply' | 'ai_revert',
  jobId: string,
  now: Date = new Date(),
): ClaimedAiMutationPlan {
  const sqlite = sqliteFor(db);
  const nowIso = now.toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const claimed = sqlite
      .prepare(
        `UPDATE reviewed_mutation_plan
         SET claimed_by_job_id = COALESCE(claimed_by_job_id, ?),
             claimed_at = COALESCE(claimed_at, ?)
         WHERE token_hash = ? AND operation = ?
           AND ((claimed_by_job_id IS NULL AND consumed_at IS NULL AND expires_at > ?)
                OR claimed_by_job_id = ?)
         RETURNING id, payload_json AS payloadJson`,
      )
      .get(jobId, nowIso, hashToken(token), operation, nowIso, jobId) as
      { id: string; payloadJson: string } | undefined;
    if (!claimed) {
      const existing = sqlite
        .prepare(
          `SELECT operation, expires_at AS expiresAt, consumed_at AS consumedAt,
                  claimed_by_job_id AS claimedByJobId
           FROM reviewed_mutation_plan WHERE token_hash = ?`,
        )
        .get(hashToken(token)) as
        | {
            operation: string;
            expiresAt: string;
            consumedAt: string | null;
            claimedByJobId: string | null;
          }
        | undefined;
      if (!existing) throw new MutationPlanError('not_found');
      if (existing.operation !== operation) throw new MutationPlanError('operation_mismatch');
      if (existing.claimedByJobId && existing.claimedByJobId !== jobId) {
        throw new MutationPlanError('claimed');
      }
      if (existing.expiresAt <= nowIso) throw new MutationPlanError('expired');
      throw new MutationPlanError('consumed');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(claimed.payloadJson);
    } catch {
      throw new MutationPlanError('invalid_payload');
    }
    const parsed = aiMutationPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new MutationPlanError('invalid_payload');
    sqlite.exec('COMMIT');
    return { planId: claimed.id, operation, ...parsed.data };
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

function differingReviewedFields(
  current: FrozenReviewedState,
  frozen: FrozenReviewedState,
): string[] {
  const fields: string[] = [];
  for (const key of Object.keys(frozen) as Array<keyof FrozenReviewedState>) {
    if (JSON.stringify(current[key]) !== JSON.stringify(frozen[key])) fields.push(key);
  }
  return fields;
}

function appliedTagAudit(value: string | null): AppliedTagAudit | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as number[] | AppliedTagAudit;
  if (Array.isArray(parsed)) {
    return {
      after: parsed,
      tagAdded: [],
      tagRemoved: [],
      processedTagId: null,
      processedTagAdded: false,
    };
  }
  return parsed;
}

function appliedSelection(
  requested: AiFieldSelection,
  appliedFields: readonly string[],
): AiFieldSelection {
  const applied = new Set(appliedFields);
  return {
    title: requested.title && applied.has('title'),
    correspondent: requested.correspondent && applied.has('correspondent'),
    documentType: requested.documentType && applied.has('documentType'),
    tags: requested.tags && applied.has('tags'),
    processedTag:
      requested.processedTag &&
      appliedFields.some((field) => field === 'processedTag' || field.startsWith('processedTag:')),
    customFieldIds: requested.customFieldIds.filter((id) => applied.has(`customField:${id}`)),
  };
}

async function syncSelectedLocalCache(
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

function intendedAppliedState(
  row: typeof aiProcessingResult.$inferSelect,
  selection: AiFieldSelection,
  processedTagId: number | null = null,
): FrozenReviewedState | null {
  if (!row.appliedFieldsJson) return null;
  const appliedFields = JSON.parse(row.appliedFieldsJson) as string[];
  const actualSelection = appliedSelection(selection, appliedFields);
  const state: FrozenReviewedState = {};
  if (actualSelection.title) state.title = row.appliedTitle ?? undefined;
  if (actualSelection.correspondent) state.correspondent = row.appliedCorrespondentId;
  if (actualSelection.documentType) state.documentType = row.appliedDocumentTypeId;
  if (actualSelection.tags) {
    state.tags = [...(appliedTagAudit(row.appliedTagIdsJson)?.after ?? [])].sort((a, b) => a - b);
  } else if (actualSelection.processedTag) {
    const appliedTagIds = appliedTagAudit(row.appliedTagIdsJson)?.after ?? [];
    state.tags =
      processedTagId !== null && appliedTagIds.includes(processedTagId) ? [processedTagId] : [];
  }
  if (actualSelection.customFieldIds.length > 0) {
    const ids = new Set(actualSelection.customFieldIds);
    state.customFields = row.appliedCustomFieldsJson
      ? (JSON.parse(row.appliedCustomFieldsJson) as Array<{ field: number; value: unknown }>)
          .filter(({ field }) => ids.has(field))
          .sort((left, right) => left.field - right.field)
      : [];
  }
  return state;
}

export async function executeClaimedAiApplyPlan(
  db: AppDatabase,
  client: PaperlessClient,
  plan: ClaimedAiMutationPlan,
  jobId: string,
  options: {
    processedTagName?: string;
    afterIntentPersisted?: (resultId: string) => void;
    afterRemoteMutation?: (resultId: string) => void;
  } = {},
): Promise<AiMutationExecutionResult> {
  if (plan.operation !== 'ai_apply') throw new MutationPlanError('operation_mismatch');
  const output: AiMutationExecutionResult = {
    applied: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
    total: plan.results.length,
    results: [],
  };
  const processedTagId = plan.selection.processedTag
    ? ((await client.getTags()).find(
        (tag) =>
          tag.name.toLowerCase() === (options.processedTagName ?? 'ai-processed').toLowerCase(),
      )?.id ?? null)
    : null;
  for (const frozen of plan.results) {
    try {
      const row = db
        .select()
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, frozen.resultId))
        .get();
      const auditFields = auditFieldsForSelection(plan.selection);
      const storedAppliedFields = row?.appliedFieldsJson
        ? (JSON.parse(row.appliedFieldsJson) as string[])
        : [];
      if (
        row &&
        (row.appliedStatus === 'applied' || row.appliedStatus === 'partial') &&
        storedAppliedFields.length > 0
      ) {
        const actualSelection = appliedSelection(plan.selection, storedAppliedFields);
        const live = await client.getDocument(row.paperlessId);
        const intended = intendedAppliedState(row, plan.selection, processedTagId);
        const current = selectedState(live, actualSelection, processedTagId);
        if (!intended || differingReviewedFields(current, intended).length > 0) {
          output.conflicts++;
          output.results.push({
            resultId: frozen.resultId,
            status: 'conflict',
            conflictFields: ['applied'],
          });
          continue;
        }
        await syncSelectedLocalCache(db, client, row, live, actualSelection);
        output.applied++;
        output.results.push({ resultId: frozen.resultId, status: 'applied' });
        continue;
      }
      if (
        !row ||
        row.documentId !== frozen.documentId ||
        row.paperlessId !== frozen.paperlessId ||
        !isReviewableAiResult(row) ||
        selectedSuggestionVersion(row, plan.selection) !== frozen.resultVersion
      ) {
        output.conflicts++;
        output.results.push({
          resultId: frozen.resultId,
          status: 'conflict',
          conflictFields: ['suggestion'],
        });
        continue;
      }
      const live = await client.getDocument(frozen.paperlessId);
      const liveState = selectedState(live, plan.selection, processedTagId);
      const conflictFields = differingReviewedFields(liveState, frozen.reviewedState);
      if (conflictFields.length > 0) {
        const intended = intendedAppliedState(row, plan.selection, processedTagId);
        if (intended && differingReviewedFields(liveState, intended).length === 0) {
          const actualSelection = appliedSelection(plan.selection, storedAppliedFields);
          finalizeStartedAiApply(db, row.id, storedAppliedFields);
          await syncSelectedLocalCache(db, client, row, live, actualSelection);
          output.applied++;
          output.results.push({ resultId: frozen.resultId, status: 'applied' });
          continue;
        }
        output.conflicts++;
        output.results.push({ resultId: frozen.resultId, status: 'conflict', conflictFields });
        continue;
      }
      const applied = await applyAiResult(db, client, frozen.resultId, {
        fields: fieldsForSelection(plan.selection),
        allowClearing: plan.allowClearing,
        createMissingEntities: plan.createMissingEntities,
        addProcessedTag: plan.selection.processedTag,
        processedTagName: options.processedTagName ?? 'ai-processed',
        customFieldIds: plan.selection.customFieldIds,
        liveDocument: live,
        auditFields,
        afterIntentPersisted: () => options.afterIntentPersisted?.(frozen.resultId),
        afterRemoteMutation: () => options.afterRemoteMutation?.(frozen.resultId),
        revalidateLiveDocument: (document) =>
          differingReviewedFields(
            selectedState(document, plan.selection, processedTagId),
            frozen.reviewedState,
          ),
      });
      if (!applied || applied.appliedFields.length === 0) {
        output.skipped++;
        output.results.push({ resultId: frozen.resultId, status: 'skipped' });
        continue;
      }
      output.applied++;
      output.results.push({ resultId: frozen.resultId, status: 'applied' });
    } catch (error) {
      if (isTransientPaperlessFailure(error)) throw error;
      if (error instanceof AiApplyConflictError) {
        output.conflicts++;
        output.results.push({
          resultId: frozen.resultId,
          status: 'conflict',
          conflictFields: error.conflictFields,
        });
        continue;
      }
      output.failed++;
      output.results.push({ resultId: frozen.resultId, status: 'failed' });
    }
  }
  sqliteFor(db)
    .prepare(
      `UPDATE reviewed_mutation_plan
       SET completed_at = COALESCE(completed_at, ?), consumed_at = COALESCE(consumed_at, ?)
       WHERE id = ? AND claimed_by_job_id = ?`,
    )
    .run(new Date().toISOString(), new Date().toISOString(), plan.planId, jobId);
  return output;
}

export async function computeApplyPreflight(
  db: AppDatabase,
  client: PaperlessClient,
  scope: ApplyScope,
  options: {
    fields: AiApplyField[];
    allowClearing: boolean;
    createMissingEntities: boolean;
  },
): Promise<ApplyPreflightResult> {
  const resultIds = resolveResultIdsForApplyScope(db, scope);

  if (resultIds.length === 0) {
    return {
      totalDocuments: 0,
      fieldsChanged: { title: 0, correspondent: 0, documentType: 0, tags: 0, customFields: 0 },
      newEntitiesCreated: { correspondents: [], documentTypes: [], tags: [] },
      lowConfidenceCount: 0,
      noOpCount: 0,
      destructiveClearCount: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
    };
  }

  // Load all results from DB in batches to avoid SQLite variable limit
  const allResults = [];
  const batchSize = 500;
  for (let i = 0; i < resultIds.length; i += batchSize) {
    const batch = resultIds.slice(i, i + batchSize);
    const rows = db
      .select()
      .from(aiProcessingResult)
      .where(inArray(aiProcessingResult.id, batch))
      .all();
    allResults.push(...rows);
  }

  // Fetch current Paperless entities
  const [correspondents, documentTypes, tags] = await Promise.all([
    client.getCorrespondents(),
    client.getDocumentTypes(),
    client.getTags(),
  ]);

  const existingCorrespondentNames = new Set(correspondents.map((c) => c.name.toLowerCase()));
  const existingDocTypeNames = new Set(documentTypes.map((dt) => dt.name.toLowerCase()));
  const existingTagNames = new Set(tags.map((t) => t.name.toLowerCase()));

  const result: ApplyPreflightResult = {
    totalDocuments: allResults.length,
    fieldsChanged: { title: 0, correspondent: 0, documentType: 0, tags: 0, customFields: 0 },
    newEntitiesCreated: { correspondents: [], documentTypes: [], tags: [] },
    lowConfidenceCount: 0,
    noOpCount: 0,
    destructiveClearCount: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
  };

  const newCorrespondents = new Set<string>();
  const newDocTypes = new Set<string>();
  const newTags = new Set<string>();
  const aiConfig = getAiConfig(db);

  for (const row of allResults) {
    const sugTitle = normalizeSuggestedLabel(row.suggestedTitle);
    const sugCorr = normalizeSuggestedLabel(row.suggestedCorrespondent);
    const sugDocType = normalizeSuggestedLabel(row.suggestedDocumentType);
    const sugTags = normalizeSuggestedTags(
      row.suggestedTagsJson ? JSON.parse(row.suggestedTagsJson) : [],
    );

    let confidence: Record<string, number> | null = null;
    if (row.confidenceJson) {
      try {
        confidence = JSON.parse(row.confidenceJson);
      } catch {
        // ignore
      }
    }

    // Compute average confidence (backward compat: handle 3 or 4 fields)
    if (confidence) {
      const fields = ['title', 'correspondent', 'documentType', 'tags'];
      const scores = fields.map((f) => confidence![f] ?? 0).filter((s) => s > 0);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      if (avg >= 0.8) result.confidenceDistribution.high++;
      else if (avg >= 0.5) result.confidenceDistribution.medium++;
      else result.confidenceDistribution.low++;
    } else {
      result.confidenceDistribution.low++;
    }

    const reviewInput: GateInput = {
      confidence: confidence
        ? {
            title: confidence.title ?? 0,
            correspondent: confidence.correspondent ?? 0,
            documentType: confidence.documentType ?? 0,
            tags: confidence.tags ?? 0,
          }
        : null,
      suggestedTitle: sugTitle,
      suggestedCorrespondent: sugCorr,
      suggestedDocumentType: sugDocType,
      suggestedTags: sugTags,
    };
    if (!evaluateGates(aiConfig, reviewInput).passes) {
      result.lowConfidenceCount++;
    }

    let isNoOp = true;
    let hasDestructiveClear = false;

    // Check title
    if (options.fields.includes('title')) {
      if (sugTitle) {
        if (sugTitle.toLowerCase() !== (row.currentTitle ?? '').toLowerCase()) {
          result.fieldsChanged.title++;
          isNoOp = false;
        }
      }
      // Title cannot be cleared (Paperless requires it)
    }

    // Check correspondent
    if (options.fields.includes('correspondent')) {
      if (sugCorr) {
        if (sugCorr.toLowerCase() !== (row.currentCorrespondent ?? '').toLowerCase()) {
          result.fieldsChanged.correspondent++;
          isNoOp = false;
        }
        if (!existingCorrespondentNames.has(sugCorr.toLowerCase())) {
          newCorrespondents.add(sugCorr);
        }
      } else if (options.allowClearing && row.currentCorrespondent) {
        hasDestructiveClear = true;
        isNoOp = false;
      }
    }

    // Check document type
    if (options.fields.includes('documentType')) {
      if (sugDocType) {
        if (sugDocType.toLowerCase() !== (row.currentDocumentType ?? '').toLowerCase()) {
          result.fieldsChanged.documentType++;
          isNoOp = false;
        }
        if (!existingDocTypeNames.has(sugDocType.toLowerCase())) {
          newDocTypes.add(sugDocType);
        }
      } else if (options.allowClearing && row.currentDocumentType) {
        hasDestructiveClear = true;
        isNoOp = false;
      }
    }

    // Check tags
    if (options.fields.includes('tags')) {
      const currentTags: string[] = row.currentTagsJson ? JSON.parse(row.currentTagsJson) : [];
      const currentTagSet = new Set(currentTags.map((t) => t.toLowerCase()));
      const sugTagSet = new Set(sugTags.map((t) => t.toLowerCase()));

      const tagsChanged =
        sugTags.length !== currentTags.length ||
        sugTags.some((t) => !currentTagSet.has(t.toLowerCase())) ||
        currentTags.some((t) => !sugTagSet.has(t.toLowerCase()));

      if (tagsChanged && sugTags.length > 0) {
        result.fieldsChanged.tags++;
        isNoOp = false;
      }

      for (const tag of sugTags) {
        if (!existingTagNames.has(tag.toLowerCase())) {
          newTags.add(tag);
        }
      }
    }

    if (options.fields.includes('customFields')) {
      const suggestions: unknown[] = row.suggestedCustomFieldsJson
        ? JSON.parse(row.suggestedCustomFieldsJson)
        : [];
      if (suggestions.length > 0) {
        result.fieldsChanged.customFields++;
        isNoOp = false;
      }
    }

    if (isNoOp) result.noOpCount++;
    if (hasDestructiveClear) result.destructiveClearCount++;
  }

  result.newEntitiesCreated.correspondents = Array.from(newCorrespondents);
  result.newEntitiesCreated.documentTypes = Array.from(newDocTypes);
  result.newEntitiesCreated.tags = Array.from(newTags);

  return result;
}
