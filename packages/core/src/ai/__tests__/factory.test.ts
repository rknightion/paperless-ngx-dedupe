import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiProvider, createInteractiveAiProvider } from '../providers/factory.js';

// Mock the actual provider module to avoid requiring real SDK installation
vi.mock('../providers/openai.js', () => ({
  OpenAiProvider: {
    create: vi.fn().mockResolvedValue({
      provider: 'openai',
      extract: vi.fn(),
    }),
  },
}));

describe('createAiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OpenAI provider', async () => {
    const provider = await createAiProvider('sk-test-key', 'gpt-5.4-mini');
    expect(provider.provider).toBe('openai');
  });

  it('passes maxRetries to provider constructor', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 5);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5, true);
  });

  it('passes maxRetries and flexProcessing to provider constructor', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 5, false);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5, false);
  });

  it('defaults flexProcessing to true', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 3);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 3, true);
  });
});

describe('createInteractiveAiProvider', () => {
  it.each([
    [10, 2],
    [1, 1],
    [0, 0],
  ])('caps configured retries %s at %s and disables Flex', async (configured, expected) => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    const provider = await createInteractiveAiProvider('test-api-key', 'test-model', configured);
    expect(provider.provider).toBe('openai');
    expect(OpenAiProvider.create).toHaveBeenLastCalledWith(
      'test-api-key',
      'test-model',
      expected,
      false,
    );
  });
});
