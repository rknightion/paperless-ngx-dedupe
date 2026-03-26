import { eq, isNotNull } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ai-feedback');

export interface AiFeedback {
  action: 'rejected' | 'corrected' | 'partial_applied';
  rejectedFields?: ('correspondent' | 'documentType' | 'tags')[];
  corrections?: {
    correspondent?: { suggested: string | null; corrected: string | null };
    documentType?: { suggested: string | null; corrected: string | null };
    tags?: { suggested: string[]; corrected: string[] };
  };
  reason?: string;
  timestamp: string;
}

export interface AiFeedbackSummary {
  totalFeedback: number;
  rejections: number;
  corrections: number;
  partialApplied: number;
  topRejectedFields: { field: string; count: number }[];
  topCorrectionPatterns: {
    field: string;
    suggestedValue: string;
    correctedValue: string;
    count: number;
  }[];
}

export function recordFeedback(db: AppDatabase, resultId: string, feedback: AiFeedback): void {
  const row = db
    .select({ feedbackJson: aiProcessingResult.feedbackJson })
    .from(aiProcessingResult)
    .where(eq(aiProcessingResult.id, resultId))
    .get();

  if (!row) {
    logger.warn({ resultId }, 'Cannot record feedback: AI result not found');
    return;
  }

  const existing: AiFeedback[] = row.feedbackJson ? JSON.parse(row.feedbackJson) : [];
  existing.push(feedback);

  db.update(aiProcessingResult)
    .set({ feedbackJson: JSON.stringify(existing) })
    .where(eq(aiProcessingResult.id, resultId))
    .run();

  logger.info({ resultId, action: feedback.action }, 'Recorded AI feedback');
}

export function getFeedbackSummary(db: AppDatabase): AiFeedbackSummary {
  const rows = db
    .select({
      feedbackJson: aiProcessingResult.feedbackJson,
    })
    .from(aiProcessingResult)
    .where(isNotNull(aiProcessingResult.feedbackJson))
    .all();

  let totalFeedback = 0;
  let rejections = 0;
  let corrections = 0;
  let partialApplied = 0;
  const fieldCounts = new Map<string, number>();
  const correctionCounts = new Map<string, { count: number; suggestedValue: string; correctedValue: string; field: string }>();

  for (const row of rows) {
    const entries: AiFeedback[] = JSON.parse(row.feedbackJson!);

    for (const entry of entries) {
      totalFeedback++;

      switch (entry.action) {
        case 'rejected':
          rejections++;
          break;
        case 'corrected':
          corrections++;
          break;
        case 'partial_applied':
          partialApplied++;
          break;
      }

      // Count rejected fields
      if (entry.rejectedFields) {
        for (const field of entry.rejectedFields) {
          fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
        }
      }

      // Count correction patterns
      if (entry.corrections) {
        for (const [field, correction] of Object.entries(entry.corrections)) {
          if (field === 'tags') {
            const tagCorrection = correction as { suggested: string[]; corrected: string[] };
            const key = `${field}:${JSON.stringify(tagCorrection.suggested)}→${JSON.stringify(tagCorrection.corrected)}`;
            const existing = correctionCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              correctionCounts.set(key, {
                count: 1,
                field,
                suggestedValue: JSON.stringify(tagCorrection.suggested),
                correctedValue: JSON.stringify(tagCorrection.corrected),
              });
            }
          } else {
            const labelCorrection = correction as { suggested: string | null; corrected: string | null };
            const key = `${field}:${labelCorrection.suggested ?? ''}→${labelCorrection.corrected ?? ''}`;
            const existing = correctionCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              correctionCounts.set(key, {
                count: 1,
                field,
                suggestedValue: labelCorrection.suggested ?? '',
                correctedValue: labelCorrection.corrected ?? '',
              });
            }
          }
        }
      }
    }
  }

  // Sort rejected fields by count descending
  const topRejectedFields = [...fieldCounts.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  // Sort correction patterns by count descending
  const topCorrectionPatterns = [...correctionCounts.values()]
    .sort((a, b) => b.count - a.count);

  return {
    totalFeedback,
    rejections,
    corrections,
    partialApplied,
    topRejectedFields,
    topCorrectionPatterns,
  };
}
