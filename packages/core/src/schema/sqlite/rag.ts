import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import { document } from './documents.js';

export const documentChunk = sqliteTable(
  'document_chunk',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    metadata: text('metadata'),
    contentHash: text('content_hash').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_chunk_document_id').on(table.documentId),
    index('idx_chunk_content_hash').on(table.contentHash),
  ],
);

export const ragConversation = sqliteTable('rag_conversation', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text('title'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ragMessage = sqliteTable(
  'rag_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => ragConversation.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    sourcesJson: text('sources_json'),
    tokenUsage: integer('token_usage'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_msg_conversation_id').on(table.conversationId)],
);
