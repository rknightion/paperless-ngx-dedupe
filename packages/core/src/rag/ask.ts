import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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

function createLlmModel(config: RagConfig, openaiApiKey: string) {
  const openai = createOpenAI({ apiKey: openaiApiKey });
  return openai(config.answerModel);
}

export async function askDocuments(
  db: AppDatabase,
  sqlite: Database.Database,
  opts: AskOptions,
): Promise<AskResult> {
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

  const context = buildContext(searchResults, opts.config.maxContextTokens);

  let conversationId = opts.conversationId;
  if (!conversationId) {
    const conversation = createConversation(db, opts.question.slice(0, 80));
    conversationId = conversation.id;
  }

  const history = getConversationMessages(db, conversationId);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  const userPrompt = context
    ? `Context from your documents:\n${context}\n\nQuestion: ${opts.question}`
    : opts.question;
  messages.push({ role: 'user', content: userPrompt });

  addMessage(db, conversationId, 'user', opts.question, JSON.stringify(sources));

  const model = createLlmModel(opts.config, opts.openaiApiKey);
  const streamResult = streamText({
    model,
    system: opts.config.systemPrompt,
    messages,
  });

  const saveResponse = (text: string, totalTokens?: number) => {
    addMessage(db, conversationId, 'assistant', text, undefined, totalTokens);
  };

  return { streamResult, conversationId, sources, saveResponse };
}
