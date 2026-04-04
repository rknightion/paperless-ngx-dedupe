import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiProvider } from '../providers/factory.js';

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
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5);
  });
});
