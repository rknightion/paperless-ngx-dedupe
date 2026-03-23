import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import { hybridSearch } from './search.js';
import { createConversation, addMessage, getConversationMessages } from './conversations.js';
import type { RagConfig, SearchResult, RagSource } from './types.js';

interface AskOptions {
  question: string;
  conversationId?: string;
  config: RagConfig;
  openaiApiKey: string;
  anthropicApiKey?: string;
}

export interface AskResult {
  streamResult: ReturnType<typeof streamText>;
  conversationId: string;
  sources: RagSource[];
  saveResponse: (text: string, totalTokens?: number) => void;
}

function buildContext(results: SearchResult[], maxTokens: number): string {
  const parts: string[] = [];
  let tokenBudget = maxTokens;

  for (const result of results) {
    const approxTokens = Math.ceil(result.chunkContent.length / 4);
    if (approxTokens > tokenBudget) break;
    tokenBudget -= approxTokens;

    parts.push(`--- Document: ${result.documentTitle} ---\n${result.chunkContent}`);
  }

  return parts.join('\n\n');
}

function createLlmModel(config: RagConfig, openaiApiKey: string, anthropicApiKey?: string) {
  if (config.answerProvider === 'anthropic') {
    if (!anthropicApiKey) throw new Error('Anthropic API key required for RAG answers');
    const anthropic = createAnthropic({ apiKey: anthropicApiKey });
    return anthropic(config.answerModel);
  }
  const openai = createOpenAI({ apiKey: openaiApiKey });
  return openai(config.answerModel);
}

export async function askDocuments(
  db: AppDatabase,
  sqlite: Database.Database,
  opts: AskOptions,
): Promise<AskResult> {
  // Retrieve relevant chunks
  const searchResults = await hybridSearch(
    sqlite,
    db,
    opts.question,
    opts.config,
    opts.openaiApiKey,
  );

  const sources: RagSource[] = searchResults.map((r) => ({
    documentId: r.documentId,
    title: r.documentTitle,
    chunkContent: r.chunkContent,
    score: r.score,
  }));

  // Build context from search results
  const context = buildContext(searchResults, opts.config.maxContextTokens);

  // Get or create conversation
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const conversation = createConversation(db, opts.question.slice(0, 80));
    conversationId = conversation.id;
  }

  // Load conversation history for multi-turn
  const history = getConversationMessages(db, conversationId);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current question with context
  const userPrompt = context
    ? `Context from your documents:\n${context}\n\nQuestion: ${opts.question}`
    : opts.question;
  messages.push({ role: 'user', content: userPrompt });

  // Save user message
  addMessage(db, conversationId, 'user', opts.question, JSON.stringify(sources));

  // Stream LLM response
  const model = createLlmModel(opts.config, opts.openaiApiKey, opts.anthropicApiKey);
  const streamResult = streamText({
    model,
    system: opts.config.systemPrompt,
    messages,
  });

  // Provide a callback to save the assistant response after streaming completes
  const saveResponse = (text: string, totalTokens?: number) => {
    addMessage(db, conversationId, 'assistant', text, undefined, totalTokens);
  };

  return { streamResult, conversationId, sources, saveResponse };
}
