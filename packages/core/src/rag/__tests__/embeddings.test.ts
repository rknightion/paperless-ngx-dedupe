import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEmbedMany, mockEmbed, mockEmbedding, mockCreateOpenAI } = vi.hoisted(() => {
  const mockEmbedMany = vi.fn();
  const mockEmbed = vi.fn();
  const mockEmbedding = vi.fn();
  const mockCreateOpenAI = vi.fn(() => ({ embedding: mockEmbedding }));
  return { mockEmbedMany, mockEmbed, mockEmbedding, mockCreateOpenAI };
});

vi.mock('ai', () => ({
  embedMany: mockEmbedMany,
  embed: mockEmbed,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

import {
  generateEmbeddings,
  generateEmbedding,
  embeddingOptionsFromConfig,
} from '../embeddings.js';
import type { RagConfig } from '../types.js';
import { DEFAULT_RAG_CONFIG } from '../types.js';

describe('embeddingOptionsFromConfig', () => {
  it('extracts apiKey, model, dimensions from config', () => {
    const config: RagConfig = {
      ...DEFAULT_RAG_CONFIG,
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 3072,
    };
    const opts = embeddingOptionsFromConfig(config, 'sk-test-key');

    expect(opts.apiKey).toBe('sk-test-key');
    expect(opts.model).toBe('text-embedding-3-large');
    expect(opts.dimensions).toBe(3072);
  });

  it('uses default config values', () => {
    const opts = embeddingOptionsFromConfig(DEFAULT_RAG_CONFIG, 'key');
    expect(opts.model).toBe('text-embedding-3-small');
    expect(opts.dimensions).toBe(1536);
  });
});

describe('generateEmbeddings', () => {
  const opts = { apiKey: 'test-key', model: 'text-embedding-3-small', dimensions: 1536 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedding.mockReturnValue('mock-model');
  });

  it('returns empty array for empty input (no API call)', async () => {
    const result = await generateEmbeddings([], opts);
    expect(result).toEqual([]);
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it('returns embeddings for single batch', async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockEmbedMany.mockResolvedValue({ embeddings: [embedding, embedding] });

    const result = await generateEmbeddings(['text1', 'text2'], opts);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(embedding);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it('batches in groups of 100', async () => {
    // First call returns 100, second call returns 50
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: Array(100).fill([0.1]),
    });
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: Array(50).fill([0.2]),
    });

    const texts = Array(150).fill('text');
    const result = await generateEmbeddings(texts, opts);

    expect(mockEmbedMany).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
  });
});

describe('generateEmbedding', () => {
  const opts = { apiKey: 'test-key', model: 'text-embedding-3-small', dimensions: 1536 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedding.mockReturnValue('mock-model');
  });

  it('returns Float32Array', async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const result = await generateEmbedding('test text', opts);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(0.1);
  });
});
