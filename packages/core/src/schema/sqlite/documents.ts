import { blob, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const document = sqliteTable(
  'document',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    paperlessId: integer('paperless_id').notNull(),
    title: text('title').notNull(),
    fingerprint: text('fingerprint'),
    correspondent: text('correspondent'),
    documentType: text('document_type'),
    tagsJson: text('tags_json'),
    createdDate: text('created_date'),
    addedDate: text('added_date'),
    modifiedDate: text('modified_date'),
    processingStatus: text('processing_status').default('pending'),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [uniqueIndex('document_paperless_id_unique').on(table.paperlessId)],
);

export const documentContent = sqliteTable(
  'document_content',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id),
    fullText: text('full_text'),
    normalizedText: text('normalized_text'),
    wordCount: integer('word_count').default(0),
    contentHash: text('content_hash'),
  },
  (table) => [uniqueIndex('document_content_document_id_unique').on(table.documentId)],
);

export const documentSignature = sqliteTable(
  'document_signature',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id),
    minhashSignature: blob('minhash_signature', { mode: 'buffer' }),
    algorithmVersion: text('algorithm_version').notNull(),
    numPermutations: integer('num_permutations').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('document_signature_document_id_unique').on(table.documentId)],
);
