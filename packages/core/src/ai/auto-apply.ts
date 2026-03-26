import type { AppDatabase } from '../db/client.js';
import type { PaperlessClient } from '../paperless/client.js';
import type { AiConfig } from './types.js';
import { evaluateGates } from './gates.js';
import type { GateContext } from './gates.js';
import { applyAiResult } from './apply.js';
import { createLogger } from '../logger.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { inArray } from 'drizzle-orm';

const logger = createLogger('ai-auto-apply');

export interface AutoApplyResult {
  totalEvaluated: number;
  autoApplied: number;
  skippedByGates: number;
  details: {
    resultId: string;
    applied: boolean;
    fieldsApplied: string[];
    reasons: string[];
  }[];
}

export async function evaluateAndAutoApply(
  db: AppDatabase,
  client: PaperlessClient,
  resultIds: string[],
  config: AiConfig,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<AutoApplyResult> {
  if (resultIds.length === 0) {
    return { totalEvaluated: 0, autoApplied: 0, skippedByGates: 0, details: [] };
  }

  // Load results — only those still in pending_review status
  const results = db
    .select()
    .from(aiProcessingResult)
    .where(inArray(aiProcessingResult.id, resultIds))
    .all()
    .filter((r) => r.appliedStatus === 'pending_review');

  if (results.length === 0) {
    return { totalEvaluated: 0, autoApplied: 0, skippedByGates: 0, details: [] };
  }

  // Fetch existing entities for gate context
  const [correspondents, documentTypes, tags] = await Promise.all([
    client.getCorrespondents(),
    client.getDocumentTypes(),
    client.getTags(),
  ]);

  const context: GateContext = {
    existingCorrespondentNames: new Set(correspondents.map((c) => c.name.toLowerCase())),
    existingDocTypeNames: new Set(documentTypes.map((dt) => dt.name.toLowerCase())),
    existingTagNames: new Set(tags.map((t) => t.name.toLowerCase())),
  };

  // Determine which fields auto-apply is allowed to touch
  const allowedFields: ('correspondent' | 'documentType' | 'tags')[] = config.tagsOnlyAutoApply
    ? ['tags']
    : ['correspondent', 'documentType', 'tags'];

  const details: AutoApplyResult['details'] = [];
  let autoApplied = 0;
  let skippedByGates = 0;

  for (let i = 0; i < results.length; i++) {
    const row = results[i];

    // Parse stored data
    const confidence: { correspondent: number; documentType: number; tags: number } | null =
      row.confidenceJson ? JSON.parse(row.confidenceJson) : null;
    const suggestedTags: string[] = row.suggestedTagsJson
      ? JSON.parse(row.suggestedTagsJson)
      : [];
    const currentTags: string[] = row.currentTagsJson ? JSON.parse(row.currentTagsJson) : [];

    // The AI only processes docs with fullText (batch.ts skips docs without it)
    const hasOcrText = true;

    const evaluation = evaluateGates(
      config,
      {
        confidence,
        suggestedCorrespondent: row.suggestedCorrespondent,
        suggestedDocumentType: row.suggestedDocumentType,
        suggestedTags,
        currentCorrespondent: row.currentCorrespondent,
        currentDocumentType: row.currentDocumentType,
        currentTags,
        hasOcrText,
      },
      context,
    );

    if (!evaluation.autoApplyEligible) {
      skippedByGates++;
      details.push({
        resultId: row.id,
        applied: false,
        fieldsApplied: [],
        reasons: evaluation.autoApplyBlockReasons,
      });
      continue;
    }

    // Apply with constrained options — auto-apply never clears existing values
    try {
      await applyAiResult(db, client, row.id, {
        fields: allowedFields,
        allowClearing: false,
        createMissingEntities: !config.neverAutoCreateEntities,
        addProcessedTag: config.addProcessedTag,
        processedTagName: config.processedTagName,
      });
      autoApplied++;
      details.push({
        resultId: row.id,
        applied: true,
        fieldsApplied: allowedFields,
        reasons: [],
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn({ resultId: row.id, error: errMsg }, 'Auto-apply failed for result');
      details.push({
        resultId: row.id,
        applied: false,
        fieldsApplied: [],
        reasons: [`Apply failed: ${errMsg}`],
      });
    }

    if (onProgress) {
      await onProgress(
        (i + 1) / results.length,
        `Auto-applied ${autoApplied}/${results.length} results`,
      );
    }
  }

  logger.info(
    { totalEvaluated: results.length, autoApplied, skippedByGates },
    'Auto-apply batch completed',
  );

  return {
    totalEvaluated: results.length,
    autoApplied,
    skippedByGates,
    details,
  };
}
