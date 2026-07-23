import { eq } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import type { PaperlessClient } from '../paperless/client.js';
import type { PaperlessCustomFieldInstance, DocumentUpdate } from '../paperless/types.js';
import type { AppDatabase } from '../db/client.js';
import { createLogger } from '../logger.js';
import { withSpan } from '../telemetry/spans.js';
import { aiApplyTotal } from '../telemetry/metrics.js';

const logger = createLogger('ai-revert');

export async function revertAiResult(
  db: AppDatabase,
  client: PaperlessClient,
  resultId: string,
): Promise<void> {
  return withSpan(
    'dedupe.ai.revert',
    {
      'ai.result_id': resultId,
    },
    async () => {
      const row = db
        .select()
        .from(aiProcessingResult)
        .where(eq(aiProcessingResult.id, resultId))
        .get();

      if (!row) throw new Error(`AI result not found: ${resultId}`);

      if (row.appliedStatus !== 'applied' && row.appliedStatus !== 'partial') {
        throw new Error(
          `Cannot revert: result status is '${row.appliedStatus}', expected 'applied' or 'partial'`,
        );
      }

      // Validate pre-apply snapshot exists
      const hasSnapshot =
        row.preApplyTitle !== null ||
        row.preApplyCorrespondentId !== null ||
        row.preApplyCorrespondentName !== null ||
        row.preApplyDocumentTypeId !== null ||
        row.preApplyDocumentTypeName !== null ||
        row.preApplyTagIdsJson !== null ||
        row.preApplyTagNamesJson !== null ||
        row.preApplyCustomFieldsJson !== null;

      if (!hasSnapshot) {
        throw new Error(
          'Cannot revert: no pre-apply snapshot exists (result was applied before audit tracking)',
        );
      }

      // Restore original state in Paperless
      const preApplyTagIds: number[] = row.preApplyTagIdsJson
        ? JSON.parse(row.preApplyTagIdsJson)
        : [];

      const preApplyCustomFields: PaperlessCustomFieldInstance[] | undefined =
        row.preApplyCustomFieldsJson ? JSON.parse(row.preApplyCustomFieldsJson) : undefined;

      const revertUpdate: DocumentUpdate = {
        correspondent: row.preApplyCorrespondentId ?? null,
        documentType: row.preApplyDocumentTypeId ?? null,
        tags: preApplyTagIds,
      };

      // Only revert title if we have a pre-apply title snapshot
      if (row.preApplyTitle) {
        revertUpdate.title = row.preApplyTitle;
      }
      if (preApplyCustomFields) {
        revertUpdate.customFields = preApplyCustomFields;
      }

      await client.updateDocument(row.paperlessId, revertUpdate);

      const localUpdate: Record<string, unknown> = {
        correspondent: row.preApplyCorrespondentName ?? null,
        documentType: row.preApplyDocumentTypeName ?? null,
        tagsJson: JSON.stringify(
          row.preApplyTagNamesJson ? JSON.parse(row.preApplyTagNamesJson) : [],
        ),
      };
      if (row.preApplyTitle) localUpdate.title = row.preApplyTitle;
      if (preApplyCustomFields) {
        localUpdate.customFieldsJson = JSON.stringify(preApplyCustomFields);
      }
      db.update(document).set(localUpdate).where(eq(document.paperlessId, row.paperlessId)).run();

      // Atomically update status to reverted
      const result = db
        .update(aiProcessingResult)
        .set({
          appliedStatus: 'reverted',
          revertedAt: new Date().toISOString(),
        })
        .where(eq(aiProcessingResult.id, resultId))
        .run();

      if (result.changes === 0) {
        throw new Error('Failed to update result status: concurrent modification');
      }

      aiApplyTotal().add(1, { status: 'reverted' });
      logger.info(
        { resultId, paperlessId: row.paperlessId },
        'Reverted AI result to pre-apply state',
      );
    },
  );
}
