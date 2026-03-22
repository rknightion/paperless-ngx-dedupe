import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import { document } from './documents.js';

export const aiProcessingResult = sqliteTable(
  'ai_processing_result',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id),
    paperlessId: integer('paperless_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    suggestedCorrespondent: text('suggested_correspondent'),
    suggestedDocumentType: text('suggested_document_type'),
    suggestedTagsJson: text('suggested_tags_json'),
    confidenceJson: text('confidence_json'),
    currentCorrespondent: text('current_correspondent'),
    currentDocumentType: text('current_document_type'),
    currentTagsJson: text('current_tags_json'),
    appliedStatus: text('applied_status').default('pending'),
    appliedAt: text('applied_at'),
    appliedFieldsJson: text('applied_fields_json'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    errorMessage: text('error_message'),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('ai_processing_result_document_id_unique').on(table.documentId)],
);
