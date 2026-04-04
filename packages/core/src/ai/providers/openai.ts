import type {
  AiProviderInterface,
  AiExtractionRequest,
  AiExtractionResult,
  AiExtractionResponse,
  RateLimitInfo,
} from './types.js';
import { AiExtractionError, aiExtractionResponseSchema } from './types.js';

/** Parse OpenAI's x-ratelimit-reset-tokens duration string (e.g., "6ms", "1.5s", "1m30s") to ms. */
export function parseResetDuration(value: string): number | null {
  if (!value) return null;

  let totalMs = 0;
  let matched = false;

  const minMatch = value.match(/(\d+)m(?!s)/);
  if (minMatch) {
    totalMs += parseInt(minMatch[1], 10) * 60_000;
    matched = true;
  }

  const secMatch = value.match(/([\d.]+)s/);
  if (secMatch) {
    totalMs += parseFloat(secMatch[1]) * 1000;
    matched = true;
  }

  const msMatch = value.match(/(\d+)ms/);
  if (msMatch) {
    totalMs += parseInt(msMatch[1], 10);
    matched = true;
  }

  return matched ? Math.round(totalMs) : null;
}

/** Parse retry-after header (float seconds) to ms. Returns 5000ms default if missing/unparseable. */
export function parseRetryAfterMs(value: string | null): number {
  if (!value) return 5000;
  const seconds = parseFloat(value);
  if (isNaN(seconds)) return 5000;
  return Math.round(seconds * 1000);
}

/** Parse rate limit headers from an OpenAI response. Returns undefined if any required header is missing. */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limitStr = headers.get('x-ratelimit-limit-tokens');
  const remainingStr = headers.get('x-ratelimit-remaining-tokens');
  const resetStr = headers.get('x-ratelimit-reset-tokens');

  if (!limitStr || !remainingStr) return undefined;

  const limitTokens = parseInt(limitStr, 10);
  const remainingTokens = parseInt(remainingStr, 10);

  if (isNaN(limitTokens) || isNaN(remainingTokens)) return undefined;

  const resetTokensMs = resetStr ? (parseResetDuration(resetStr) ?? 0) : 0;

  return { limitTokens, remainingTokens, resetTokensMs };
}

export class OpenAiProvider implements AiProviderInterface {
  readonly provider = 'openai' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private model: string;
  private flexProcessing: boolean;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(client: any, model: string, flexProcessing: boolean) {
    this.client = client;
    this.model = model;
    this.flexProcessing = flexProcessing;
  }

  static async create(
    apiKey: string,
    model: string,
    maxRetries = 3,
    flexProcessing = true,
  ): Promise<OpenAiProvider> {
    try {
      const { default: OpenAI } = await import('openai');
      const timeout = flexProcessing ? 900_000 : 60_000;
      const client = new OpenAI({ apiKey, maxRetries, timeout });
      return new OpenAiProvider(client, model, flexProcessing);
    } catch {
      throw new Error('OpenAI SDK not installed. Install it with: pnpm add openai');
    }
  }

  async extract(request: AiExtractionRequest): Promise<AiExtractionResult> {
    const { zodTextFormat } = await import('openai/helpers/zod');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = {
      model: this.model,
      input: [
        { role: 'developer', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      text: { format: zodTextFormat(aiExtractionResponseSchema, 'document_classification') },
    };

    params.service_tier = this.flexProcessing ? 'flex' : 'default';

    if (request.reasoningEffort && request.reasoningEffort !== 'none') {
      params.reasoning = { effort: request.reasoningEffort };
    }

    let response;
    let rateLimit: RateLimitInfo | undefined;

    try {
      const { data, response: httpResponse } = await this.client.responses
        .parse(params)
        .withResponse();
      response = data;
      rateLimit = parseRateLimitHeaders(httpResponse.headers);
    } catch (error) {
      // Catch OpenAI SDK RateLimitError and wrap it
      if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
        const sdkError = error as unknown as {
          message: string;
          headers?: Headers;
          requestID?: string;
        };
        const retryAfterMs = parseRetryAfterMs(sdkError.headers?.get('retry-after') ?? null);
        throw new AiExtractionError(
          'rate_limit',
          sdkError.message,
          sdkError.requestID,
          retryAfterMs,
        );
      }
      throw error;
    }

    // Check for refusal
    if (response.refusal) {
      throw new AiExtractionError('refusal', response.refusal, response.id);
    }

    // Check for incomplete response
    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      const failureType = reason === 'max_output_tokens' ? 'max_tokens' : 'timeout';
      throw new AiExtractionError(failureType, `Incomplete response: ${reason}`, response.id);
    }

    // Use SDK-parsed output
    if (!response.output_parsed) {
      throw new AiExtractionError('schema_mismatch', 'No parsed output in response', response.id);
    }

    try {
      const parsed = aiExtractionResponseSchema.parse(
        response.output_parsed,
      ) as AiExtractionResponse;
      return {
        response: parsed,
        usage: {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          cachedTokens: response.usage?.input_tokens_details?.cached_tokens,
        },
        rateLimit,
      };
    } catch (error) {
      throw new AiExtractionError(
        'schema_mismatch',
        `Schema validation failed: ${(error as Error).message}`,
        response.id,
      );
    }
  }
}
