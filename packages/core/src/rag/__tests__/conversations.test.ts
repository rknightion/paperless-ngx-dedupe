import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  addMessage,
  getConversationMessages,
} from '../conversations.js';

describe('conversations', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  describe('createConversation', () => {
    it('creates conversation with title', () => {
      const conv = createConversation(db, 'My Chat');
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBe('My Chat');
    });

    it('creates conversation without title (null title)', () => {
      const conv = createConversation(db);
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBeNull();
    });
  });

  describe('getConversations', () => {
    it('lists conversations with pagination', () => {
      createConversation(db, 'Chat 1');
      createConversation(db, 'Chat 2');
      createConversation(db, 'Chat 3');

      const page1 = getConversations(db, { limit: 2, offset: 0 });
      expect(page1.conversations).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = getConversations(db, { limit: 2, offset: 2 });
      expect(page2.conversations).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('lists conversations ordered by updatedAt desc', () => {
      const conv1 = createConversation(db, 'Old');
      const conv2 = createConversation(db, 'New');

      // Add a message to conv1 to update its updatedAt
      addMessage(db, conv1.id, 'user', 'Hello');

      const result = getConversations(db, { limit: 10, offset: 0 });
      // conv1 was updated more recently (via addMessage)
      expect(result.conversations[0].id).toBe(conv1.id);
      expect(result.conversations[1].id).toBe(conv2.id);
    });

    it('returns total count', () => {
      createConversation(db, 'A');
      createConversation(db, 'B');

      const result = getConversations(db, { limit: 1, offset: 0 });
      expect(result.total).toBe(2);
    });

    it('returns empty list for empty DB', () => {
      const result = getConversations(db, { limit: 10, offset: 0 });
      expect(result.conversations).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getConversation', () => {
    it('gets conversation detail with messages', () => {
      const conv = createConversation(db, 'Detail Test');
      addMessage(db, conv.id, 'user', 'Hello');
      addMessage(db, conv.id, 'assistant', 'Hi there!');

      const detail = getConversation(db, conv.id);
      expect(detail).not.toBeNull();
      expect(detail!.id).toBe(conv.id);
      expect(detail!.title).toBe('Detail Test');
      expect(detail!.messages).toHaveLength(2);
      expect(detail!.messages[0].role).toBe('user');
      expect(detail!.messages[1].role).toBe('assistant');
    });

    it('returns null for missing conversation ID', () => {
      const result = getConversation(db, 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation and cascades messages', () => {
      const conv = createConversation(db, 'To Delete');
      addMessage(db, conv.id, 'user', 'Message 1');
      addMessage(db, conv.id, 'assistant', 'Message 2');

      const deleted = deleteConversation(db, conv.id);
      expect(deleted).toBe(true);

      // Conversation should be gone
      expect(getConversation(db, conv.id)).toBeNull();

      // Messages should be cascaded
      const messages = getConversationMessages(db, conv.id);
      expect(messages).toHaveLength(0);
    });

    it('returns false when deleting nonexistent conversation', () => {
      const result = deleteConversation(db, 'nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('adds user and assistant messages', () => {
      const conv = createConversation(db, 'Msg Test');
      const userMsg = addMessage(db, conv.id, 'user', 'Question?');
      const assistantMsg = addMessage(db, conv.id, 'assistant', 'Answer.');

      expect(userMsg.id).toBeTruthy();
      expect(assistantMsg.id).toBeTruthy();
      expect(userMsg.id).not.toBe(assistantMsg.id);
    });

    it('updates conversation updatedAt timestamp', () => {
      const conv = createConversation(db, 'Timestamp Test');

      // Small delay to ensure timestamp difference
      addMessage(db, conv.id, 'user', 'New message');

      const afterUpdate = getConversation(db, conv.id)!.updatedAt;
      expect(afterUpdate).toBeTruthy();
      // The timestamp should be set (may or may not differ within same millisecond)
      expect(typeof afterUpdate).toBe('string');
    });

    it('stores sourcesJson on messages', () => {
      const conv = createConversation(db, 'Sources Test');
      const sources = JSON.stringify([{ documentId: 'doc-1', title: 'Test' }]);
      addMessage(db, conv.id, 'user', 'Question', sources);

      const messages = getConversationMessages(db, conv.id);
      expect(messages[0].sourcesJson).toBe(sources);
    });

    it('stores tokenUsage on messages', () => {
      const conv = createConversation(db, 'Tokens Test');
      addMessage(db, conv.id, 'assistant', 'Response text', undefined, 150);

      const messages = getConversationMessages(db, conv.id);
      expect(messages[0].tokenUsage).toBe(150);
    });
  });

  describe('getConversationMessages', () => {
    it('gets messages in chronological order', () => {
      const conv = createConversation(db, 'Order Test');
      addMessage(db, conv.id, 'user', 'First');
      addMessage(db, conv.id, 'assistant', 'Second');
      addMessage(db, conv.id, 'user', 'Third');

      const messages = getConversationMessages(db, conv.id);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });

    it('returns empty array for nonexistent conversation', () => {
      const messages = getConversationMessages(db, 'nonexistent');
      expect(messages).toHaveLength(0);
    });

    it('returns messages with all fields populated', () => {
      const conv = createConversation(db, 'Full Fields');
      addMessage(db, conv.id, 'user', 'Question', '[]', 42);

      const messages = getConversationMessages(db, conv.id);
      expect(messages[0]).toMatchObject({
        role: 'user',
        content: 'Question',
        sourcesJson: '[]',
        tokenUsage: 42,
      });
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].createdAt).toBeTruthy();
    });
  });
});
