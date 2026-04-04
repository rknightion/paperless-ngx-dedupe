import type { AiProviderInterface } from './types.js';
import { OpenAiProvider } from './openai.js';

export async function createAiProvider(
  apiKey: string,
  model: string,
  maxRetries = 3,
  flexProcessing = true,
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(apiKey, model, maxRetries, flexProcessing);
}
