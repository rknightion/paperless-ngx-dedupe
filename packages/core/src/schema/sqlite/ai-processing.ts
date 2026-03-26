import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
    appliedStatus: text('applied_status').default('pending_review'),
    appliedAt: text('applied_at'),
    appliedFieldsJson: text('applied_fields_json'),
    evidence: text('evidence'),
    failureType: text('failure_type'),
    rawResponseJson: text('raw_response_json'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    errorMessage: text('error_message'),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: text('created_at').notNull(),

    // Audit: pre-apply snapshot (captured at apply time, not processing time)
    preApplyCorrespondentId: integer('pre_apply_correspondent_id'),
    preApplyCorrespondentName: text('pre_apply_correspondent_name'),
    preApplyDocumentTypeId: integer('pre_apply_document_type_id'),
    preApplyDocumentTypeName: text('pre_apply_document_type_name'),
    preApplyTagIdsJson: text('pre_apply_tag_ids_json'),
    preApplyTagNamesJson: text('pre_apply_tag_names_json'),

    // Audit: what was actually written to Paperless
    appliedCorrespondentId: integer('applied_correspondent_id'),
    appliedDocumentTypeId: integer('applied_document_type_id'),
    appliedTagIdsJson: text('applied_tag_ids_json'),

    // Revert tracking
    revertedAt: text('reverted_at'),

    // Feedback for model quality loops
    feedbackJson: text('feedback_json'),

    // Cost tracking
    estimatedCostUsd: real('estimated_cost_usd'),
  },
  (table) => [uniqueIndex('ai_processing_result_document_id_unique').on(table.documentId)],
);
