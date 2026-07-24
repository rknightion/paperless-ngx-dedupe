import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import { type PaperlessClient } from '../paperless/client.js';
import { PaperlessApiError } from '../paperless/errors.js';
import type {
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessTag,
  PaperlessCustomField,
  PaperlessCustomFieldInstance,
  PaperlessDocument,
  DocumentUpdate,
} from '../paperless/types.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { aiApplyTotal } from '../telemetry/metrics.js';
import {
  markAiResultApplied,
  markAiResultRejected,
  markAiResultFailed,
  markAiResultApplyStarted,
  batchMarkRejected,
  type ApplySnapshot,
  type AppliedTagAudit,
} from './queries.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { recordFeedback } from './feedback.js';
import { normalizeCustomFieldRecommendations } from './custom-fields.js';
import type { AiCustomFieldRecommendation } from './providers/types.js';

const logger = createLogger('ai-apply');

/** Pre-fetched reference data to avoid redundant API calls in batch mode. */
export interface ReferenceData {
  correspondents: PaperlessCorrespondent[];
  documentTypes: PaperlessDocumentType[];
  tags: PaperlessTag[];
  customFields?: PaperlessCustomField[];
}

export type AiApplyField = 'title' | 'correspondent' | 'documentType' | 'tags' | 'customFields';

export interface ApplyOptions {
  fields: AiApplyField[];
  addProcessedTag?: boolean;
  processedTagName?: string;
  /** Allow clearing existing Paperless metadata when suggestion is null. Default: false */
  allowClearing?: boolean;
  /** Allow creating new correspondents/document types/tags in Paperless. Default: true */
  createMissingEntities?: boolean;
  /** Whether protected tags filtering is active */
  protectedTagsEnabled?: boolean;
  /** Tag names that should never be added or removed by AI */
  protectedTagNames?: string[];
  /** Pre-fetched reference data — when provided, skips per-document API fetches. */
  referenceData?: ReferenceData;
  /** Exact custom-field IDs approved in a reviewed mutation plan. */
  customFieldIds?: readonly number[];
  /** Live document fetched immediately before a reviewed mutation. */
  liveDocument?: PaperlessDocument;
  /** Exact field identifiers persisted to the apply audit. */
  auditFields?: readonly string[];
  /** Testable crash boundary hook, invoked after the durable intent write. */
  afterIntentPersisted?: () => void;
  /** Testable crash boundary hook, invoked after Paperless accepts the mutation. */
  afterRemoteMutation?: () => void;
  /** Revalidate the final live document after reference resolution. */
  revalidateLiveDocument?: (document: PaperlessDocument) => string[];
}

export interface AiApplyOutcome {
  appliedFields: string[];
  skippedFields: string[];
  liveDocument: PaperlessDocument;
  update: DocumentUpdate;
}

export class AiApplyConflictError extends Error {
  constructor(public readonly conflictFields: string[]) {
    super(`Reviewed Paperless fields changed: ${conflictFields.join(', ')}`);
    this.name = 'AiApplyConflictError';
  }
}

function customValue(fields: readonly PaperlessCustomFieldInstance[], fieldId: number): unknown {
  return fields.find(({ field }) => field === fieldId)?.value;
}

export async function applyAiResult(
  db: AppDatabase,
  client: PaperlessClient,
  resultId: string,
  options: ApplyOptions,
): Promise<AiApplyOutcome | void> {
  return withSpan(
    'dedupe.ai.apply',
    {
      'ai.result_id': resultId,
      'ai.fields': options.fields.join(','),
    },
    async () => {
      const row = db
        .select()
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, resultId))
        .get();

      if (!row) throw new Error(`AI result not found: ${resultId}`);

      // Normalize suggestions defensively (belt-and-suspenders for pre-existing data)
      const suggestedTitle = normalizeSuggestedLabel(row.suggestedTitle);
      const suggestedCorrespondent = normalizeSuggestedLabel(row.suggestedCorrespondent);
      const suggestedDocumentType = normalizeSuggestedLabel(row.suggestedDocumentType);
      const suggestedTags = normalizeSuggestedTags(
        row.suggestedTagsJson ? JSON.parse(row.suggestedTagsJson) : [],
      );
      const rawSuggestedCustomFields: AiCustomFieldRecommendation[] = row.suggestedCustomFieldsJson
        ? JSON.parse(row.suggestedCustomFieldsJson)
        : [];

      if (
        !options.auditFields &&
        !suggestedTitle &&
        !suggestedCorrespondent &&
        !suggestedDocumentType &&
        suggestedTags.length === 0 &&
        rawSuggestedCustomFields.length === 0
      ) {
        markAiResultFailed(db, resultId, 'No suggestions to apply', 'no_suggestions');
        throw new Error('No suggestions to apply');
      }

      // Use pre-fetched reference data when available (batch mode), otherwise fetch per-document
      let correspondents: PaperlessCorrespondent[];
      let documentTypes: PaperlessDocumentType[];
      let tags: PaperlessTag[];
      let customFields: PaperlessCustomField[];

      if (options.referenceData) {
        correspondents = options.referenceData.correspondents;
        documentTypes = options.referenceData.documentTypes;
        tags = options.referenceData.tags;
        customFields =
          options.referenceData.customFields ??
          (options.fields.includes('customFields') ? await client.getCustomFields() : []);
      } else {
        [correspondents, documentTypes, tags, customFields] = await Promise.all([
          client.getCorrespondents(),
          client.getDocumentTypes(),
          client.getTags(),
          options.fields.includes('customFields') ? client.getCustomFields() : Promise.resolve([]),
        ]);
      }
      const suggestedCustomFields = normalizeCustomFieldRecommendations(
        rawSuggestedCustomFields,
        customFields,
      );

      // Build pre-apply snapshot: use local DB data in batch mode, live API in single-doc mode
      let preApplyCorrespondent: PaperlessCorrespondent | null | undefined;
      let preApplyDocType: PaperlessDocumentType | null | undefined;
      let preApplyTagNames: string[];
      let currentDocTagIds: number[];
      let currentCustomFields: PaperlessCustomFieldInstance[];
      let currentDoc: PaperlessDocument | undefined;

      if (
        options.referenceData &&
        !options.fields.includes('customFields') &&
        !options.liveDocument
      ) {
        // Reconstruct from AI result row's stored current* values + reference data
        preApplyCorrespondent = row.currentCorrespondent
          ? correspondents.find(
              (c) => c.name.toLowerCase() === row.currentCorrespondent!.toLowerCase(),
            )
          : null;
        preApplyDocType = row.currentDocumentType
          ? documentTypes.find(
              (dt) => dt.name.toLowerCase() === row.currentDocumentType!.toLowerCase(),
            )
          : null;
        const currentTagNames: string[] = row.currentTagsJson
          ? JSON.parse(row.currentTagsJson)
          : [];
        preApplyTagNames = currentTagNames;
        currentDocTagIds = currentTagNames
          .map((name) => tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.id)
          .filter((id): id is number => id !== undefined);
        currentCustomFields = row.currentCustomFieldsJson
          ? JSON.parse(row.currentCustomFieldsJson)
          : [];
      } else {
        try {
          currentDoc = options.liveDocument ?? (await client.getDocument(row.paperlessId));
        } catch (err) {
          if (err instanceof PaperlessApiError && err.statusCode === 404) {
            const msg = `Document no longer exists in Paperless (paperlessId=${row.paperlessId})`;
            logger.warn({ resultId, paperlessId: row.paperlessId }, msg);
            markAiResultFailed(db, resultId, msg, 'document_not_found');
            aiApplyTotal().add(1, { status: 'failed' });
            return;
          }
          throw err;
        }
        preApplyCorrespondent = currentDoc!.correspondent
          ? correspondents.find((c) => c.id === currentDoc!.correspondent)
          : null;
        preApplyDocType = currentDoc!.documentType
          ? documentTypes.find((dt) => dt.id === currentDoc!.documentType)
          : null;
        preApplyTagNames = currentDoc!.tags
          .map((tid) => tags.find((t) => t.id === tid)?.name)
          .filter((n): n is string => n !== undefined);
        currentDocTagIds = currentDoc!.tags;
        currentCustomFields = currentDoc!.customFields;
      }

      const update: DocumentUpdate = {};
      let resolvedTagIds: number[] | null = null;
      let protectedTagSet = new Set<string>();

      // Resolve title (simple string — no entity resolution needed)
      if (options.fields.includes('title')) {
        if (suggestedTitle) {
          update.title = suggestedTitle;
        }
        // Title is required in Paperless, so we never clear it (even with allowClearing)
      }

      // Resolve correspondent
      if (options.fields.includes('correspondent')) {
        if (suggestedCorrespondent) {
          let found = correspondents.find(
            (c) => c.name.toLowerCase() === suggestedCorrespondent.toLowerCase(),
          );
          if (!found) {
            if (options.createMissingEntities === false) {
              logger.info(
                { name: suggestedCorrespondent },
                'Skipping: would create new correspondent',
              );
            } else {
              found = await client.createCorrespondent(suggestedCorrespondent);
              correspondents.push(found);
              logger.info({ name: suggestedCorrespondent }, 'Created new correspondent');
            }
          }
          if (found) update.correspondent = found.id;
        } else if (options.allowClearing) {
          update.correspondent = null;
        }
        // else: no suggestion and allowClearing is false → leave untouched
      }

      // Resolve document type
      if (options.fields.includes('documentType')) {
        if (suggestedDocumentType) {
          let found = documentTypes.find(
            (dt) => dt.name.toLowerCase() === suggestedDocumentType.toLowerCase(),
          );
          if (!found) {
            if (options.createMissingEntities === false) {
              logger.info(
                { name: suggestedDocumentType },
                'Skipping: would create new document type',
              );
            } else {
              found = await client.createDocumentType(suggestedDocumentType);
              documentTypes.push(found);
              logger.info({ name: suggestedDocumentType }, 'Created new document type');
            }
          }
          if (found) update.documentType = found.id;
        } else if (options.allowClearing) {
          update.documentType = null;
        }
        // else: no suggestion and allowClearing is false → leave untouched
      }

      // Resolve tags
      if (options.fields.includes('tags')) {
        resolvedTagIds = [];

        // Build protected tag set (case-insensitive)
        protectedTagSet = new Set(
          options.protectedTagsEnabled && options.protectedTagNames
            ? options.protectedTagNames.map((n) => n.toLowerCase())
            : [],
        );

        for (const tagName of suggestedTags) {
          if (protectedTagSet.has(tagName.toLowerCase())) {
            logger.info({ name: tagName }, 'Skipping protected tag from AI suggestion');
            continue;
          }
          let found = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
          if (!found) {
            if (options.createMissingEntities === false) {
              logger.info({ name: tagName }, 'Skipping: would create new tag');
              continue;
            }
            found = await client.createTag(tagName);
            tags.push(found); // add to local cache
            logger.info({ name: tagName }, 'Created new tag');
          }
          resolvedTagIds.push(found.id);
        }

        // Preserve protected tags already on the document
        if (protectedTagSet.size > 0) {
          for (const existingTagId of currentDocTagIds) {
            const existingTag = tags.find((t) => t.id === existingTagId);
            if (existingTag && protectedTagSet.has(existingTag.name.toLowerCase())) {
              if (!resolvedTagIds.includes(existingTagId)) {
                resolvedTagIds.push(existingTagId);
                logger.info({ name: existingTag.name }, 'Preserving protected tag on document');
              }
            }
          }
        }

        if (resolvedTagIds.length > 0 || options.allowClearing) {
          update.tags = resolvedTagIds;
        }
        // else: no tags resolved and allowClearing is false → leave untouched
      }

      let processedTagId: number | null = null;
      if (options.addProcessedTag && options.processedTagName) {
        let processedTag = tags.find(
          (tag) => tag.name.toLowerCase() === options.processedTagName!.toLowerCase(),
        );
        if (!processedTag) {
          processedTag = await client.createTag(options.processedTagName);
          tags.push(processedTag);
          logger.info({ name: options.processedTagName }, 'Created ai-processed tag');
        }
        processedTagId = processedTag.id;
      }

      const finalLiveDocument = options.auditFields
        ? await client.getDocument(row.paperlessId)
        : currentDoc;
      if (options.auditFields) {
        if (!finalLiveDocument) {
          throw new Error('A live Paperless document is required for reviewed apply');
        }
        const finalConflicts = options.revalidateLiveDocument?.(finalLiveDocument) ?? [];
        if (finalConflicts.length > 0) throw new AiApplyConflictError(finalConflicts);
        currentDocTagIds = finalLiveDocument.tags;
        currentCustomFields = finalLiveDocument.customFields;
        preApplyCorrespondent = finalLiveDocument.correspondent
          ? correspondents.find((item) => item.id === finalLiveDocument.correspondent)
          : null;
        preApplyDocType = finalLiveDocument.documentType
          ? documentTypes.find((item) => item.id === finalLiveDocument.documentType)
          : null;
        preApplyTagNames = finalLiveDocument.tags
          .map((id) => tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => name !== undefined);
      }

      if (resolvedTagIds && finalLiveDocument) {
        for (const existingTagId of finalLiveDocument.tags) {
          const existingTag = tags.find((tag) => tag.id === existingTagId);
          if (
            existingTag &&
            protectedTagSet.has(existingTag.name.toLowerCase()) &&
            !resolvedTagIds.includes(existingTagId)
          ) {
            resolvedTagIds.push(existingTagId);
          }
        }
        if (resolvedTagIds.length > 0 || options.allowClearing) update.tags = resolvedTagIds;
        else delete update.tags;
      }
      const tagsBeforeProcessed = [...(update.tags ?? finalLiveDocument?.tags ?? currentDocTagIds)];
      if (processedTagId !== null) {
        const selectedTags = [...tagsBeforeProcessed];
        if (!selectedTags.includes(processedTagId)) selectedTags.push(processedTagId);
        update.tags = selectedTags;
      }

      if (options.fields.includes('customFields') && suggestedCustomFields.length > 0) {
        const merged = currentCustomFields.map((instance) => ({ ...instance }));
        const indexes = new Map(merged.map((instance, index) => [instance.field, index]));

        const approvedIds = options.customFieldIds ? new Set(options.customFieldIds) : null;
        for (const recommendation of suggestedCustomFields) {
          if (approvedIds && !approvedIds.has(recommendation.fieldId)) continue;
          const instance = { field: recommendation.fieldId, value: recommendation.value };
          const index = indexes.get(recommendation.fieldId);
          if (index === undefined) {
            indexes.set(recommendation.fieldId, merged.length);
            merged.push(instance);
          } else {
            merged[index] = instance;
          }
        }

        update.customFields = merged;
      }

      let exactAuditFields = [...(options.auditFields ?? options.fields)];
      let tagAudit: AppliedTagAudit | null = null;
      if (options.auditFields) {
        if (!finalLiveDocument) throw new Error('Reviewed apply lost its live document');
        const actual = new Set<string>();
        if (
          options.auditFields.includes('title') &&
          update.title !== undefined &&
          update.title !== finalLiveDocument.title
        ) {
          actual.add('title');
        } else {
          delete update.title;
        }
        if (
          options.auditFields.includes('correspondent') &&
          update.correspondent !== undefined &&
          update.correspondent !== finalLiveDocument.correspondent
        ) {
          actual.add('correspondent');
        } else {
          delete update.correspondent;
        }
        if (
          options.auditFields.includes('documentType') &&
          update.documentType !== undefined &&
          update.documentType !== finalLiveDocument.documentType
        ) {
          actual.add('documentType');
        } else {
          delete update.documentType;
        }

        const finalTagIds = update.tags ?? finalLiveDocument.tags;
        const tagAdded = tagsBeforeProcessed.filter(
          (id) =>
            !finalLiveDocument.tags.includes(id) &&
            !(options.auditFields!.includes('processedTag') && id === processedTagId),
        );
        const tagRemoved = finalLiveDocument.tags.filter((id) => !finalTagIds.includes(id));
        const processedTagAdded =
          processedTagId !== null &&
          !finalLiveDocument.tags.includes(processedTagId) &&
          finalTagIds.includes(processedTagId);
        if (
          options.auditFields.includes('tags') &&
          (tagAdded.length > 0 || tagRemoved.length > 0)
        ) {
          actual.add('tags');
        }
        if (options.auditFields.includes('processedTag') && processedTagAdded) {
          actual.add(`processedTag:${processedTagId}`);
        }
        if (
          (options.auditFields.includes('tags') || options.auditFields.includes('processedTag')) &&
          (tagAdded.length > 0 || tagRemoved.length > 0 || processedTagAdded)
        ) {
          tagAudit = {
            after: [...finalTagIds],
            tagAdded,
            tagRemoved,
            processedTagId,
            processedTagAdded,
          };
        } else {
          delete update.tags;
        }

        const changedCustomIds = new Set<number>();
        for (const fieldName of options.auditFields) {
          if (!fieldName.startsWith('customField:')) continue;
          const fieldId = Number(fieldName.slice('customField:'.length));
          if (
            update.customFields &&
            customValue(update.customFields, fieldId) !==
              customValue(finalLiveDocument.customFields, fieldId)
          ) {
            actual.add(fieldName);
            changedCustomIds.add(fieldId);
          }
        }
        if (changedCustomIds.size === 0) delete update.customFields;
        exactAuditFields = options.auditFields.flatMap((field) =>
          field === 'processedTag'
            ? [...actual].filter((actualField) => actualField.startsWith('processedTag:'))
            : actual.has(field)
              ? [field]
              : [],
        );
      }

      if (options.auditFields && Object.keys(update).length === 0) {
        return {
          appliedFields: [],
          skippedFields: [...options.auditFields],
          liveDocument: finalLiveDocument!,
          update,
        };
      }

      // Build audit snapshot
      const selectedCustomFieldIds = new Set(options.customFieldIds ?? []);
      const snapshot: ApplySnapshot = {
        preApply: {
          title: finalLiveDocument?.title ?? row.currentTitle ?? null,
          correspondentId: preApplyCorrespondent?.id ?? null,
          correspondentName: preApplyCorrespondent?.name ?? null,
          documentTypeId: preApplyDocType?.id ?? null,
          documentTypeName: preApplyDocType?.name ?? null,
          tagIds: currentDocTagIds.length > 0 ? currentDocTagIds : null,
          tagNames: preApplyTagNames.length > 0 ? preApplyTagNames : null,
          customFields: options.customFieldIds
            ? currentCustomFields.filter((field) => selectedCustomFieldIds.has(field.field))
            : currentCustomFields,
        },
        applied: {
          title: update.title ?? null,
          correspondentId: update.correspondent !== undefined ? update.correspondent : null,
          documentTypeId: update.documentType !== undefined ? update.documentType : null,
          tagIds: update.tags ?? null,
          tagAudit,
          customFields: options.customFieldIds
            ? (update.customFields?.filter((field) => selectedCustomFieldIds.has(field.field)) ??
              null)
            : (update.customFields ?? null),
        },
      };

      if (options.auditFields) {
        markAiResultApplyStarted(db, resultId, exactAuditFields, snapshot);
        options.afterIntentPersisted?.();
      }

      // Apply to Paperless-NGX
      await client.updateDocument(row.paperlessId, update);
      options.afterRemoteMutation?.();
      logger.info(
        { paperlessId: row.paperlessId, fields: options.fields },
        'Applied AI suggestions to document',
      );

      // Update DB status
      markAiResultApplied(db, resultId, exactAuditFields, snapshot);

      // Sync applied values back to the local document table so re-running
      // AI processing uses the updated metadata instead of stale values
      const docUpdate: Record<string, unknown> = {};
      if (update.title) {
        docUpdate.title = update.title;
      }
      if (update.correspondent !== undefined) {
        const c = correspondents.find((cr) => cr.id === update.correspondent);
        docUpdate.correspondent = c?.name ?? null;
      }
      if (update.documentType !== undefined) {
        const dt = documentTypes.find((d) => d.id === update.documentType);
        docUpdate.documentType = dt?.name ?? null;
      }
      if (update.tags) {
        const tagNames = update.tags
          .map((id) => tags.find((t) => t.id === id)?.name)
          .filter((n): n is string => n !== undefined);
        docUpdate.tagsJson = JSON.stringify(tagNames);
      }
      if (update.customFields) {
        docUpdate.customFieldsJson = JSON.stringify(update.customFields);
      }
      if (Object.keys(docUpdate).length > 0) {
        db.update(document).set(docUpdate).where(eq(document.paperlessId, row.paperlessId)).run();
      }

      // Record feedback if only some fields were applied
      const allFields: AiApplyField[] = ['title', 'correspondent', 'documentType', 'tags'];
      if (suggestedCustomFields.length > 0) allFields.push('customFields');
      const excludedFields = allFields.filter((f) => !options.fields.includes(f));
      if (excludedFields.length > 0) {
        recordFeedback(db, resultId, {
          action: 'partial_applied',
          rejectedFields: excludedFields,
          timestamp: new Date().toISOString(),
        });
      }

      aiApplyTotal().add(1, { status: 'applied' });
      if (!options.auditFields) return;
      return {
        appliedFields: exactAuditFields,
        skippedFields: (options.auditFields ?? []).filter(
          (field) =>
            !exactAuditFields.includes(field) &&
            !(
              field === 'processedTag' &&
              exactAuditFields.some((actual) => actual.startsWith('processedTag:'))
            ),
        ),
        liveDocument: finalLiveDocument!,
        update,
      };
    },
  );
}

export function rejectAiResult(db: AppDatabase, resultId: string): void {
  markAiResultRejected(db, resultId);
  recordFeedback(db, resultId, {
    action: 'rejected',
    timestamp: new Date().toISOString(),
  });
  aiApplyTotal().add(1, { status: 'rejected' });
  logger.info({ resultId }, 'Rejected AI result');
}

export function rejectAiResultWithReason(db: AppDatabase, resultId: string, reason?: string): void {
  markAiResultRejected(db, resultId);
  recordFeedback(db, resultId, {
    action: 'rejected',
    reason,
    timestamp: new Date().toISOString(),
  });
  aiApplyTotal().add(1, { status: 'rejected' });
  logger.info({ resultId, reason }, 'Rejected AI result with reason');
}

export function batchRejectAiResults(db: AppDatabase, ids: string[]): void {
  batchMarkRejected(db, ids);
  aiApplyTotal().add(ids.length, { status: 'rejected' });
  logger.info({ count: ids.length }, 'Batch rejected AI results');
}
