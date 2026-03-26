import { inArray } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { type PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';
import { resolveResultIdsForApplyScope } from './scopes.js';
import type { ApplyScope } from './scopes.js';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from './normalize.js';

export interface ApplyPreflightResult {
  totalDocuments: number;
  fieldsChanged: {
    correspondent: number;
    documentType: number;
    tags: number;
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

export async function computeApplyPreflight(
  db: AppDatabase,
  client: PaperlessClient,
  scope: ApplyScope,
  options: {
    fields: ('correspondent' | 'documentType' | 'tags')[];
    allowClearing: boolean;
    createMissingEntities: boolean;
  },
): Promise<ApplyPreflightResult> {
  const resultIds = resolveResultIdsForApplyScope(db, scope);

  if (resultIds.length === 0) {
    return {
      totalDocuments: 0,
      fieldsChanged: { correspondent: 0, documentType: 0, tags: 0 },
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
    fieldsChanged: { correspondent: 0, documentType: 0, tags: 0 },
    newEntitiesCreated: { correspondents: [], documentTypes: [], tags: [] },
    lowConfidenceCount: 0,
    noOpCount: 0,
    destructiveClearCount: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
  };

  const newCorrespondents = new Set<string>();
  const newDocTypes = new Set<string>();
  const newTags = new Set<string>();

  for (const row of allResults) {
    const sugCorr = normalizeSuggestedLabel(row.suggestedCorrespondent);
    const sugDocType = normalizeSuggestedLabel(row.suggestedDocumentType);
    const sugTags = normalizeSuggestedTags(
      row.suggestedTagsJson ? JSON.parse(row.suggestedTagsJson) : [],
    );

    let confidence: { correspondent: number; documentType: number; tags: number } | null = null;
    if (row.confidenceJson) {
      try {
        confidence = JSON.parse(row.confidenceJson);
      } catch {
        // ignore
      }
    }

    // Compute average confidence
    if (confidence) {
      const avg = (confidence.correspondent + confidence.documentType + confidence.tags) / 3;
      if (avg >= 0.8) result.confidenceDistribution.high++;
      else if (avg >= 0.5) result.confidenceDistribution.medium++;
      else result.confidenceDistribution.low++;

      if (avg < 0.5) result.lowConfidenceCount++;
    } else {
      result.confidenceDistribution.low++;
      result.lowConfidenceCount++;
    }

    let isNoOp = true;
    let hasDestructiveClear = false;

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

    if (isNoOp) result.noOpCount++;
    if (hasDestructiveClear) result.destructiveClearCount++;
  }

  result.newEntitiesCreated.correspondents = Array.from(newCorrespondents);
  result.newEntitiesCreated.documentTypes = Array.from(newDocTypes);
  result.newEntitiesCreated.tags = Array.from(newTags);

  return result;
}
