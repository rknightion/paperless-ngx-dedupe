import type { AiProviderInterface } from './types.js';
import { OpenAiProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

export async function createAiProvider(
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string,
  maxRetries = 3,
): Promise<AiProviderInterface> {
  switch (provider) {
    case 'openai':
      return OpenAiProvider.create(apiKey, model, maxRetries);
    case 'anthropic':
      return AnthropicProvider.create(apiKey, model, maxRetries);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
