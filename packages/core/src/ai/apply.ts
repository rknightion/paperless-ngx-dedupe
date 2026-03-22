import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { markAiResultApplied } from './queries.js';

const logger = createLogger('ai-apply');

export interface ApplyOptions {
  fields: ('correspondent' | 'documentType' | 'tags')[];
  addProcessedTag?: boolean;
  processedTagName?: string;
}

export async function applyAiResult(
  db: AppDatabase,
  client: PaperlessClient,
  resultId: string,
  options: ApplyOptions,
): Promise<void> {
  const row = db.select().from(aiProcessingResult).where(eq(aiProcessingResult.id, resultId)).get();

  if (!row) throw new Error(`AI result not found: ${resultId}`);
  if (!row.suggestedCorrespondent && !row.suggestedDocumentType && !row.suggestedTagsJson) {
    throw new Error('No suggestions to apply');
  }

  // Fetch current reference data
  const [correspondents, documentTypes, tags] = await Promise.all([
    client.getCorrespondents(),
    client.getDocumentTypes(),
    client.getTags(),
  ]);

  const update: { correspondent?: number | null; documentType?: number | null; tags?: number[] } =
    {};

  // Resolve correspondent
  if (options.fields.includes('correspondent')) {
    if (row.suggestedCorrespondent) {
      let found = correspondents.find(
        (c) => c.name.toLowerCase() === row.suggestedCorrespondent!.toLowerCase(),
      );
      if (!found) {
        found = await client.createCorrespondent(row.suggestedCorrespondent);
        logger.info({ name: row.suggestedCorrespondent }, 'Created new correspondent');
      }
      update.correspondent = found.id;
    } else {
      update.correspondent = null;
    }
  }

  // Resolve document type
  if (options.fields.includes('documentType')) {
    if (row.suggestedDocumentType) {
      let found = documentTypes.find(
        (dt) => dt.name.toLowerCase() === row.suggestedDocumentType!.toLowerCase(),
      );
      if (!found) {
        found = await client.createDocumentType(row.suggestedDocumentType);
        logger.info({ name: row.suggestedDocumentType }, 'Created new document type');
      }
      update.documentType = found.id;
    } else {
      update.documentType = null;
    }
  }

  // Resolve tags
  if (options.fields.includes('tags')) {
    const suggestedTags: string[] = row.suggestedTagsJson ? JSON.parse(row.suggestedTagsJson) : [];
    const resolvedTagIds: number[] = [];

    for (const tagName of suggestedTags) {
      let found = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (!found) {
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

    update.tags = resolvedTagIds;
  }

  // Apply to Paperless-NGX
  await client.updateDocument(row.paperlessId, update);
  logger.info(
    { paperlessId: row.paperlessId, fields: options.fields },
    'Applied AI suggestions to document',
  );

  // Update DB status
  markAiResultApplied(db, resultId, options.fields);
}
