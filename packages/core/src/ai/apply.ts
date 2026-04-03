import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import { type PaperlessClient } from '../paperless/client.js';
import type {
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessTag,
} from '../paperless/types.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { aiApplyTotal } from '../telemetry/metrics.js';
import {
  markAiResultApplied,
  markAiResultRejected,
  markAiResultFailed,
  batchMarkRejected,
  type ApplySnapshot,
} from './queries.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { recordFeedback } from './feedback.js';

const logger = createLogger('ai-apply');

/** Pre-fetched reference data to avoid redundant API calls in batch mode. */
export interface ReferenceData {
  correspondents: PaperlessCorrespondent[];
  documentTypes: PaperlessDocumentType[];
  tags: PaperlessTag[];
}

export interface ApplyOptions {
  fields: ('title' | 'correspondent' | 'documentType' | 'tags')[];
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
}

export async function applyAiResult(
  db: AppDatabase,
  client: PaperlessClient,
  resultId: string,
  options: ApplyOptions,
): Promise<void> {
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

      if (
        !suggestedTitle &&
        !suggestedCorrespondent &&
        !suggestedDocumentType &&
        suggestedTags.length === 0
      ) {
        markAiResultFailed(db, resultId, 'No suggestions to apply', 'no_suggestions');
        throw new Error('No suggestions to apply');
      }

      // Use pre-fetched reference data when available (batch mode), otherwise fetch per-document
      let correspondents: PaperlessCorrespondent[];
      let documentTypes: PaperlessDocumentType[];
      let tags: PaperlessTag[];

      if (options.referenceData) {
        correspondents = options.referenceData.correspondents;
        documentTypes = options.referenceData.documentTypes;
        tags = options.referenceData.tags;
      } else {
        [correspondents, documentTypes, tags] = await Promise.all([
          client.getCorrespondents(),
          client.getDocumentTypes(),
          client.getTags(),
        ]);
      }

      // Build pre-apply snapshot: use local DB data in batch mode, live API in single-doc mode
      let preApplyCorrespondent: PaperlessCorrespondent | null | undefined;
      let preApplyDocType: PaperlessDocumentType | null | undefined;
      let preApplyTagNames: string[];
      let currentDocTagIds: number[];

      if (options.referenceData) {
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
      } else {
        const currentDoc = await client.getDocument(row.paperlessId);
        preApplyCorrespondent = currentDoc.correspondent
          ? correspondents.find((c) => c.id === currentDoc.correspondent)
          : null;
        preApplyDocType = currentDoc.documentType
          ? documentTypes.find((dt) => dt.id === currentDoc.documentType)
          : null;
        preApplyTagNames = currentDoc.tags
          .map((tid) => tags.find((t) => t.id === tid)?.name)
          .filter((n): n is string => n !== undefined);
        currentDocTagIds = currentDoc.tags;
      }

      const update: {
        title?: string;
        correspondent?: number | null;
        documentType?: number | null;
        tags?: number[];
      } = {};

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
        const resolvedTagIds: number[] = [];

        // Build protected tag set (case-insensitive)
        const protectedTagSet = new Set(
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

        // Add ai-processed tag if configured
        if (options.addProcessedTag && options.processedTagName) {
          let processedTag = tags.find(
            (t) => t.name.toLowerCase() === options.processedTagName!.toLowerCase(),
          );
          if (!processedTag) {
            processedTag = await client.createTag(options.processedTagName);
            logger.info({ name: options.processedTagName }, 'Created ai-processed tag');
          }
          if (!resolvedTagIds.includes(processedTag.id)) {
            resolvedTagIds.push(processedTag.id);
          }
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

      // Apply to Paperless-NGX
      await client.updateDocument(row.paperlessId, update);
      logger.info(
        { paperlessId: row.paperlessId, fields: options.fields },
        'Applied AI suggestions to document',
      );

      // Build audit snapshot
      const snapshot: ApplySnapshot = {
        preApply: {
          title: row.currentTitle ?? null,
          correspondentId: preApplyCorrespondent?.id ?? null,
          correspondentName: preApplyCorrespondent?.name ?? null,
          documentTypeId: preApplyDocType?.id ?? null,
          documentTypeName: preApplyDocType?.name ?? null,
          tagIds: currentDocTagIds.length > 0 ? currentDocTagIds : null,
          tagNames: preApplyTagNames.length > 0 ? preApplyTagNames : null,
        },
        applied: {
          title: update.title ?? null,
          correspondentId: update.correspondent !== undefined ? update.correspondent : null,
          documentTypeId: update.documentType !== undefined ? update.documentType : null,
          tagIds: update.tags ?? null,
        },
      };

      // Update DB status
      markAiResultApplied(db, resultId, options.fields, snapshot);

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
      if (Object.keys(docUpdate).length > 0) {
        db.update(document).set(docUpdate).where(eq(document.paperlessId, row.paperlessId)).run();
      }

      // Record feedback if only some fields were applied
      const allFields: ('title' | 'correspondent' | 'documentType' | 'tags')[] = [
        'title',
        'correspondent',
        'documentType',
        'tags',
      ];
      const excludedFields = allFields.filter((f) => !options.fields.includes(f));
      if (excludedFields.length > 0) {
        recordFeedback(db, resultId, {
          action: 'partial_applied',
          rejectedFields: excludedFields,
          timestamp: new Date().toISOString(),
        });
      }

      aiApplyTotal().add(1, { status: 'applied' });
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
