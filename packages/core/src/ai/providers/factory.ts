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

export const INTERACTIVE_MAX_RETRIES = 2;

export async function createInteractiveAiProvider(
  apiKey: string,
  model: string,
  configuredMaxRetries: number,
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(
    apiKey,
    model,
    Math.min(configuredMaxRetries, INTERACTIVE_MAX_RETRIES),
    false,
  );
}
