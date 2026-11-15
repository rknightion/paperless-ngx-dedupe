import { count, eq } from 'drizzle-orm';
import { type AppDatabase } from '../db/client.js';
import { document } from '../schema/sqlite/documents.js';
import { duplicateGroup } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';

/** Read the four application gauge counts without loading document content. */
export function getGaugeStats(db: AppDatabase): {
  documentsCount: number;
  unresolvedDuplicatesCount: number;
  activeJobsCount: number;
  aiPendingCount: number;
} {
  return {
    documentsCount: db.select({ value: count() }).from(document).get()!.value,
    unresolvedDuplicatesCount: db
      .select({ value: count() })
      .from(duplicateGroup)
      .where(eq(duplicateGroup.status, 'pending'))
      .get()!.value,
    activeJobsCount: db.select({ value: count() }).from(job).where(eq(job.status, 'running')).get()!
      .value,
    aiPendingCount: db
      .select({ value: count() })
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.appliedStatus, 'pending_review'))
      .get()!.value,
  };
}
