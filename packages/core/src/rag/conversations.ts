import { eq, desc, count, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { ragConversation, ragMessage } from '../schema/sqlite/rag.js';
import type { PaginationParams } from '../queries/types.js';

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: MessageDetail[];
}

export interface MessageDetail {
  id: string;
  role: string;
  content: string;
  sourcesJson: string | null;
  tokenUsage: number | null;
  createdAt: string;
}

export function createConversation(
  db: AppDatabase,
  title?: string,
): { id: string; title: string | null } {
  const now = new Date().toISOString();
  const result = db
    .insert(ragConversation)
    .values({
      title: title ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: ragConversation.id, title: ragConversation.title })
    .get();
  return result;
}

export function getConversations(
  db: AppDatabase,
  pagination: PaginationParams,
): { conversations: ConversationSummary[]; total: number } {
  const total = db.select({ count: count() }).from(ragConversation).get()!.count;

  const conversations = db
    .select({
      id: ragConversation.id,
      title: ragConversation.title,
      createdAt: ragConversation.createdAt,
      updatedAt: ragConversation.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM rag_message WHERE conversation_id = ${ragConversation.id})`,
    })
    .from(ragConversation)
    .orderBy(desc(ragConversation.updatedAt))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  return { conversations, total };
}

export function getConversation(db: AppDatabase, id: string): ConversationDetail | null {
  const conv = db.select().from(ragConversation).where(eq(ragConversation.id, id)).get();

  if (!conv) return null;

  const messages = db
    .select()
    .from(ragMessage)
    .where(eq(ragMessage.conversationId, id))
    .orderBy(ragMessage.createdAt)
    .all();

  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sourcesJson: m.sourcesJson,
      tokenUsage: m.tokenUsage,
      createdAt: m.createdAt,
    })),
  };
}

export function deleteConversation(db: AppDatabase, id: string): boolean {
  const result = db.delete(ragConversation).where(eq(ragConversation.id, id)).run();
  return result.changes > 0;
}

export function addMessage(
  db: AppDatabase,
  conversationId: string,
  role: string,
  content: string,
  sourcesJson?: string,
  tokenUsage?: number,
): { id: string } {
  const now = new Date().toISOString();

  const result = db
    .insert(ragMessage)
    .values({
      conversationId,
      role,
      content,
      sourcesJson: sourcesJson ?? null,
      tokenUsage: tokenUsage ?? null,
      createdAt: now,
    })
    .returning({ id: ragMessage.id })
    .get();

  // Update conversation updatedAt
  db.update(ragConversation)
    .set({ updatedAt: now })
    .where(eq(ragConversation.id, conversationId))
    .run();

  return result;
}

export function getConversationMessages(db: AppDatabase, conversationId: string): MessageDetail[] {
  return db
    .select()
    .from(ragMessage)
    .where(eq(ragMessage.conversationId, conversationId))
    .orderBy(ragMessage.createdAt)
    .all()
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sourcesJson: m.sourcesJson,
      tokenUsage: m.tokenUsage,
      createdAt: m.createdAt,
    }));
}
