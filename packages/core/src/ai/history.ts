import { eq, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { aiResultRevision } from '../schema/sqlite/ai-result-revisions.js';
import type { NewAiProcessingResult } from '../schema/types.js';

type Replacement = Partial<NewAiProcessingResult> &
  Pick<NewAiProcessingResult, 'provider' | 'model' | 'appliedStatus' | 'createdAt'>;

export function replaceAiResultWithRevision(
  db: AppDatabase,
  documentId: string,
  replacement: Replacement,
): void {
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.documentId, documentId))
      .get();
    if (!existing) throw new Error('AI result replacement requires an existing result');
    const nextRevision =
      tx
        .select({
          revision: sql<number>`COALESCE(MAX(${aiResultRevision.revision}), 0) + 1`,
        })
        .from(aiResultRevision)
        .where(eq(aiResultRevision.resultId, existing.id))
        .get()?.revision ?? 1;
    tx.insert(aiResultRevision)
      .values({
        resultId: existing.id,
        revision: nextRevision,
        provider: existing.provider,
        model: existing.model,
        suggestedTitle: existing.suggestedTitle,
        suggestedCorrespondent: existing.suggestedCorrespondent,
        suggestedDocumentType: existing.suggestedDocumentType,
        suggestedTagsJson: existing.suggestedTagsJson,
        suggestedCustomFieldsJson: existing.suggestedCustomFieldsJson,
        confidenceJson: existing.confidenceJson,
        evidence: existing.evidence,
        promptTokens: existing.promptTokens,
        completionTokens: existing.completionTokens,
        appliedStatus: existing.appliedStatus ?? 'pending_review',
        createdAt: replacement.createdAt,
      })
      .run();
    tx.update(aiProcessingResult)
      .set(replacement)
      .where(eq(aiProcessingResult.id, existing.id))
      .run();
  });
}

/** Explicit lifecycle owner for AI result and revision history. */
export function clearAiResultHistory(db: AppDatabase): number {
  return db.delete(aiProcessingResult).run().changes;
}
