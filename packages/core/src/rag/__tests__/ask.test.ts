import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([
    {
      chunkId: 'c1',
      documentId: 'doc-1',
      documentTitle: 'Test Doc',
      correspondent: null,
      chunkContent: 'chunk text about testing',
      chunkIndex: 0,
      score: 0.5,
    },
  ]),
}));

const mockStreamText = vi.fn().mockReturnValue({ textStream: 'mock-stream' });
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => 'openai-model')),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'anthropic-model')),
}));

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import type Database from 'better-sqlite3';
import { askDocuments } from '../ask.js';
import { DEFAULT_RAG_CONFIG } from '../types.js';
import { createConversation, getConversationMessages } from '../conversations.js';

describe('askDocuments', () => {
  let db: AppDatabase;
  let sqlite: Database.Database;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    sqlite = handle.sqlite;
    await migrateDatabase(handle.sqlite);
    vi.clearAllMocks();
    // Re-set streamText mock after clearAllMocks
    mockStreamText.mockReturnValue({ textStream: 'mock-stream' });
  });

  const defaultOpts = {
    question: 'What is in my documents?',
    config: DEFAULT_RAG_CONFIG,
    openaiApiKey: 'sk-test',
  };

  it('creates new conversation when no conversationId provided', async () => {
    const result = await askDocuments(db, sqlite, defaultOpts);
    expect(result.conversationId).toBeTruthy();
    expect(typeof result.conversationId).toBe('string');
  });

  it('returns conversationId', async () => {
    const result = await askDocuments(db, sqlite, defaultOpts);
    expect(result.conversationId).toBeDefined();
    expect(result.conversationId.length).toBeGreaterThan(0);
  });

  it('returns sources mapped from search results', async () => {
    const result = await askDocuments(db, sqlite, defaultOpts);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      documentId: 'doc-1',
      title: 'Test Doc',
      chunkContent: 'chunk text about testing',
      score: 0.5,
    });
  });

  it('calls streamText with system prompt from config', async () => {
    await askDocuments(db, sqlite, defaultOpts);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const call = mockStreamText.mock.calls[0][0];
    expect(call.system).toBe(DEFAULT_RAG_CONFIG.systemPrompt);
  });

  it('saveResponse callback adds assistant message to conversation', async () => {
    const result = await askDocuments(db, sqlite, defaultOpts);

    // Call saveResponse to persist the assistant reply
    result.saveResponse('Here is the answer.', 100);

    const messages = getConversationMessages(db, result.conversationId);
    // Should have user message (from ask) + assistant message (from saveResponse)
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe('Here is the answer.');
    expect(assistantMsgs[0].tokenUsage).toBe(100);
  });

  it('uses existing conversationId for multi-turn', async () => {
    // Create a conversation first
    const conv = createConversation(db, 'Existing Chat');

    const result = await askDocuments(db, sqlite, {
      ...defaultOpts,
      conversationId: conv.id,
    });

    expect(result.conversationId).toBe(conv.id);
  });

  it('throws when anthropic provider but no anthropic API key', async () => {
    const opts = {
      ...defaultOpts,
      config: { ...DEFAULT_RAG_CONFIG, answerProvider: 'anthropic' as const },
      // No anthropicApiKey provided
    };

    await expect(askDocuments(db, sqlite, opts)).rejects.toThrow('Anthropic API key required');
  });

  it('returns streamResult from streamText', async () => {
    const result = await askDocuments(db, sqlite, defaultOpts);
    expect(result.streamResult).toBeDefined();
    expect(result.streamResult).toHaveProperty('textStream', 'mock-stream');
  });
});
