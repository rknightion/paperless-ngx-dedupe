import { z } from 'zod';

export const RAG_CONFIG_PREFIX = 'rag.';

export const OPENAI_EMBEDDING_MODELS = [
  {
    id: 'text-embedding-3-small',
    name: 'Embedding 3 Small',
    dimensions: 1536,
    costPer1MTokens: 0.02,
  },
  {
    id: 'text-embedding-3-large',
    name: 'Embedding 3 Large',
    dimensions: 3072,
    costPer1MTokens: 0.13,
  },
] as const;

export const DEFAULT_RAG_SYSTEM_PROMPT = `You are a helpful document assistant. Answer the user's question based on the provided document context.

Rules:
- Only use information from the provided context to answer questions.
- If the context does not contain enough information to answer, say so clearly.
- Cite which documents your answer comes from using their titles.
- Be concise and direct in your answers.
- If the user asks about something not in the documents, let them know.
- Format your response in markdown when appropriate.`;

export const ragConfigSchema = z.object({
  embeddingModel: z.string().default('text-embedding-3-small'),
  embeddingDimensions: z.number().int().min(256).max(3072).default(1536),
  chunkSize: z.number().int().min(100).max(2000).default(400),
  chunkOverlap: z.number().int().min(0).max(500).default(40),
  topK: z.number().int().min(1).max(100).default(20),
  answerModel: z.string().default('gpt-5.4-mini'),
  systemPrompt: z.string().default(DEFAULT_RAG_SYSTEM_PROMPT),
  maxContextTokens: z.number().int().min(500).max(100000).default(8000),
  autoIndex: z.boolean().default(false),
  concurrentBatches: z.number().int().min(1).max(20).default(5),
});

export type RagConfig = z.infer<typeof ragConfigSchema>;

export const DEFAULT_RAG_CONFIG: RagConfig = ragConfigSchema.parse({});

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  contentHash: string;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  correspondent: string | null;
  chunkContent: string;
  chunkIndex: number;
  score: number;
}

export interface RagSource {
  documentId: string;
  title: string;
  chunkContent: string;
  score: number;
}

export interface CostEstimate {
  totalCharacters: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  embeddingModel: string;
}

export interface RagStats {
  totalChunks: number;
  indexedDocuments: number;
  unindexedDocuments: number;
  embeddingModel: string;
  lastIndexedAt: string | null;
  totalConversations: number;
  totalMessages: number;
  indexCost: CostEstimate | null;
  rebuildCost: CostEstimate | null;
  isIndexingInProgress: boolean;
}
