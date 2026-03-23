import { embedMany, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { RagConfig } from './types.js';

interface EmbeddingOptions {
  apiKey: string;
  model: string;
  dimensions: number;
}

function createProvider(apiKey: string) {
  return createOpenAI({ apiKey });
}

export async function generateEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const provider = createProvider(opts.apiKey);
  const model = provider.embedding(opts.model);
  const providerOptions = { openai: { dimensions: opts.dimensions } };

  // Batch in groups of 100
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await embedMany({ model, values: batch, providerOptions });
    allEmbeddings.push(...result.embeddings);
  }

  return allEmbeddings;
}

export async function generateEmbedding(
  text: string,
  opts: EmbeddingOptions,
): Promise<Float32Array> {
  const provider = createProvider(opts.apiKey);
  const model = provider.embedding(opts.model);
  const result = await embed({
    model,
    value: text,
    providerOptions: { openai: { dimensions: opts.dimensions } },
  });
  return new Float32Array(result.embedding);
}

export function embeddingOptionsFromConfig(config: RagConfig, apiKey: string): EmbeddingOptions {
  return {
    apiKey,
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
  };
}
