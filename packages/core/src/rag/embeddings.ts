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
  concurrentBatches = 5,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const provider = createProvider(opts.apiKey);
  const model = provider.embedding(opts.model);
  const providerOptions = { openai: { dimensions: opts.dimensions } };

  // Split into batches of 100
  const batchSize = 100;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  // Process batches with limited concurrency
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < batches.length; i += concurrentBatches) {
    const window = batches.slice(i, i + concurrentBatches);
    const results = await Promise.all(
      window.map((b) => embedMany({ model, values: b, providerOptions }).then((r) => r.embeddings)),
    );
    allEmbeddings.push(...results.flat());
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
