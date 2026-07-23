import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import { aiProcessingResult } from './ai-processing.js';

/**
 * Immutable pre-reprocessing snapshots. Their only lifecycle owner is the
 * processing result, deliberately not a cleanup-eligible job row.
 */
export const aiResultRevision = sqliteTable(
  'ai_result_revision',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    resultId: text('result_id')
      .notNull()
      .references(() => aiProcessingResult.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    suggestedTitle: text('suggested_title'),
    suggestedCorrespondent: text('suggested_correspondent'),
    suggestedDocumentType: text('suggested_document_type'),
    suggestedTagsJson: text('suggested_tags_json'),
    suggestedCustomFieldsJson: text('suggested_custom_fields_json'),
    confidenceJson: text('confidence_json'),
    evidence: text('evidence'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    appliedStatus: text('applied_status').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('ai_result_revision_result_revision_unique').on(table.resultId, table.revision),
  ],
);
