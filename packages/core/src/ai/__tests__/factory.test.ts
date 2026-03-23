import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiProvider } from '../providers/factory.js';

// Mock the actual provider modules to avoid requiring real SDK installations
vi.mock('../providers/openai.js', () => ({
  OpenAiProvider: {
    create: vi.fn().mockResolvedValue({
      provider: 'openai',
      extract: vi.fn(),
    }),
  },
}));

vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: {
    create: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      extract: vi.fn(),
    }),
  },
}));

describe('createAiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OpenAI provider', async () => {
    const provider = await createAiProvider('openai', 'sk-test-key', 'gpt-5.4-mini');
    expect(provider.provider).toBe('openai');
  });

  it('creates an Anthropic provider', async () => {
    const provider = await createAiProvider('anthropic', 'sk-ant-test', 'claude-sonnet-4-6');
    expect(provider.provider).toBe('anthropic');
  });

  it('passes maxRetries to provider constructor', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('openai', 'sk-test-key', 'gpt-5.4-mini', 5);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5);
  });

  it('throws for unknown provider string', async () => {
    // @ts-expect-error testing invalid provider
    await expect(createAiProvider('gemini', 'key', 'model')).rejects.toThrow(
      'Unknown AI provider: gemini',
    );
  });
});
