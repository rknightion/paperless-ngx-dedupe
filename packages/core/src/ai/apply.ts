import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { aiApplyTotal } from '../telemetry/metrics.js';
import {
  markAiResultApplied,
  markAiResultRejected,
  batchMarkRejected,
  type ApplySnapshot,
} from './queries.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';
import { recordFeedback } from './feedback.js';

const logger = createLogger('ai-apply');

export interface ApplyOptions {
  fields: ('correspondent' | 'documentType' | 'tags')[];
  addProcessedTag?: boolean;
  processedTagName?: string;
  /** Allow clearing existing Paperless metadata when suggestion is null. Default: false */
  allowClearing?: boolean;
  /** Allow creating new correspondents/document types/tags in Paperless. Default: true */
  createMissingEntities?: boolean;
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
      const suggestedCorrespondent = normalizeSuggestedLabel(row.suggestedCorrespondent);
      const suggestedDocumentType = normalizeSuggestedLabel(row.suggestedDocumentType);
      const suggestedTags = normalizeSuggestedTags(
        row.suggestedTagsJson ? JSON.parse(row.suggestedTagsJson) : [],
      );

      if (!suggestedCorrespondent && !suggestedDocumentType && suggestedTags.length === 0) {
        throw new Error('No suggestions to apply');
      }

      // Fetch current reference data and current document state from Paperless
      const [correspondents, documentTypes, tags, currentDoc] = await Promise.all([
        client.getCorrespondents(),
        client.getDocumentTypes(),
        client.getTags(),
        client.getDocument(row.paperlessId),
      ]);

      // Build pre-apply snapshot from actual Paperless state
      const preApplyCorrespondent = currentDoc.correspondent
        ? correspondents.find((c) => c.id === currentDoc.correspondent)
        : null;
      const preApplyDocType = currentDoc.documentType
        ? documentTypes.find((dt) => dt.id === currentDoc.documentType)
        : null;
      const preApplyTagNames = currentDoc.tags
        .map((tid) => tags.find((t) => t.id === tid)?.name)
        .filter((n): n is string => n !== undefined);

      const update: {
        correspondent?: number | null;
        documentType?: number | null;
        tags?: number[];
      } = {};

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

        for (const tagName of suggestedTags) {
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
          correspondentId: currentDoc.correspondent,
          correspondentName: preApplyCorrespondent?.name ?? null,
          documentTypeId: currentDoc.documentType,
          documentTypeName: preApplyDocType?.name ?? null,
          tagIds: currentDoc.tags.length > 0 ? currentDoc.tags : null,
          tagNames: preApplyTagNames.length > 0 ? preApplyTagNames : null,
        },
        applied: {
          correspondentId: update.correspondent !== undefined ? update.correspondent : null,
          documentTypeId: update.documentType !== undefined ? update.documentType : null,
          tagIds: update.tags ?? null,
        },
      };

      // Update DB status
      markAiResultApplied(db, resultId, options.fields, snapshot);

      // Record feedback if only some fields were applied
      const allFields: ('correspondent' | 'documentType' | 'tags')[] = [
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
