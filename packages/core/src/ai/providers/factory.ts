import type { AiProviderInterface } from './types.js';
import { OpenAiProvider, type OpenAiProviderOptions } from './openai.js';

/** Create an AI provider with the configured endpoint and request policy. */
export async function createAiProvider(
  apiKey: string | undefined,
  model: string,
  options: OpenAiProviderOptions = {},
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(apiKey, model, options);
}

export const INTERACTIVE_MAX_RETRIES = 2;

export async function createInteractiveAiProvider(
  apiKey: string | undefined,
  model: string,
  options: OpenAiProviderOptions = {},
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(apiKey, model, {
    ...options,
    maxRetries: Math.min(options.maxRetries ?? 3, INTERACTIVE_MAX_RETRIES),
    flexProcessing: false,
  });
}
