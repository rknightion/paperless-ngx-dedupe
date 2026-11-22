import type {
  AiProviderInterface,
  AiProviderUsage,
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

/** Build the selected API parameters for extraction and budget token accounting. */
export async function buildOpenAiRequestParams(
  request: AiExtractionRequest,
  model: string,
  flexProcessing: boolean,
  options: Pick<OpenAiProviderOptions, 'apiStyle' | 'baseURL'> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const { zodTextFormat, zodResponseFormat } = await import('openai/helpers/zod');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { model };
  if (options.apiStyle === 'chat') {
    params.messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];
    params.response_format = zodResponseFormat(
      aiExtractionResponseSchema,
      'document_classification',
    );
    if (request.maxOutputTokens !== undefined) {
      params.max_completion_tokens = request.maxOutputTokens;
      // Some OpenAI-compatible servers (e.g. Ollama) honour only the legacy field; OpenAI's own
      // hosts reject it for reasoning models.
      if (options.baseURL && acceptsLegacyMaxTokens(options.baseURL)) {
        params.max_tokens = request.maxOutputTokens;
      }
    }
    // Omitting effort lets a custom server fall back to the model default, which may be to think.
    if (request.reasoningEffort && (request.reasoningEffort !== 'none' || options.baseURL)) {
      params.reasoning_effort = request.reasoningEffort;
    }
  } else {
    params.input = [
      { role: 'developer', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];
    params.text = { format: zodTextFormat(aiExtractionResponseSchema, 'document_classification') };
    if (request.maxOutputTokens !== undefined) params.max_output_tokens = request.maxOutputTokens;
    if (request.reasoningEffort && (request.reasoningEffort !== 'none' || options.baseURL)) {
      params.reasoning = { effort: request.reasoningEffort };
    }
  }
  if (!options.baseURL) params.service_tier = flexProcessing ? 'flex' : 'default';
  return params;
}

/** False for OpenAI and Azure OpenAI hosts, which reject max_tokens for o-series models. */
function acceptsLegacyMaxTokens(baseURL: string): boolean {
  let host: string;
  try {
    host = new URL(baseURL).hostname.toLowerCase();
  } catch {
    return true;
  }
  return host !== 'api.openai.com' && !host.endsWith('.openai.azure.com');
}

export interface OpenAiProviderOptions {
  maxRetries?: number;
  flexProcessing?: boolean;
  baseURL?: string;
  apiStyle?: 'responses' | 'chat';
  /** Per-attempt client timeout in ms; overrides the flex/non-flex default. */
  timeoutMs?: number;
}

export class OpenAiProvider implements AiProviderInterface {
  readonly provider = 'openai' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private model: string;
  private flexProcessing: boolean;
  private options: OpenAiProviderOptions;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(client: any, model: string, options: OpenAiProviderOptions) {
    this.client = client;
    this.model = model;
    this.flexProcessing = options.flexProcessing ?? true;
    this.options = options;
  }

  static async create(
    apiKey: string | undefined,
    model: string,
    options: OpenAiProviderOptions = {},
  ): Promise<OpenAiProvider> {
    const { maxRetries = 3, flexProcessing: requestedFlex = true, baseURL, timeoutMs } = options;
    const flexProcessing = !baseURL && requestedFlex;
    try {
      const { default: OpenAI } = await import('openai');
      const timeout = timeoutMs ?? (flexProcessing ? 900_000 : 60_000);
      const client = new OpenAI({
        apiKey: apiKey || (baseURL ? 'not-required' : undefined),
        maxRetries,
        timeout,
        ...(baseURL ? { baseURL } : {}),
      });
      return new OpenAiProvider(client, model, { ...options, flexProcessing });
    } catch {
      throw new Error('OpenAI SDK not installed. Install it with: pnpm add openai');
    }
  }

  async extract(request: AiExtractionRequest): Promise<AiExtractionResult> {
    const params = await buildOpenAiRequestParams(
      request,
      this.model,
      this.flexProcessing,
      this.options,
    );

    let response;
    let rateLimit: RateLimitInfo | undefined;

    try {
      // SDK chat parsing throws on truncation before exposing billed usage.
      const { data, response: httpResponse } = await (
        this.options.apiStyle === 'chat'
          ? this.client.chat.completions.create(params)
          : this.client.responses.parse(params)
      ).withResponse();
      response = this.options.apiStyle === 'chat' ? normalizeChatCompletion(data) : data;
      rateLimit = parseRateLimitHeaders(httpResponse.headers);
    } catch (error) {
      // Catch OpenAI SDK RateLimitError and wrap it
      if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
        const sdkError = error as unknown as {
          message: string;
          code?: string | null;
          headers?: Headers;
          requestID?: string;
        };

        // Quota exhaustion is permanent — don't retry
        const isQuotaError =
          sdkError.code === 'insufficient_quota' ||
          sdkError.message.includes('exceeded your current quota');

        if (isQuotaError) {
          throw new AiExtractionError('quota_exceeded', sdkError.message, sdkError.requestID);
        }

        const retryAfterMs = parseRetryAfterMs(sdkError.headers?.get('retry-after') ?? null);
        throw new AiExtractionError(
          'rate_limit',
          sdkError.message,
          sdkError.requestID,
          retryAfterMs,
        );
      }
      const { APIConnectionError } = await import('openai');
      if (error && typeof error === 'object') {
        const status = 'status' in error ? error.status : undefined;
        if (
          (typeof status === 'number' && (status === 408 || status === 409 || status >= 500)) ||
          error instanceof APIConnectionError
        ) {
          const sdkError = error as { message: string; requestID?: string };
          throw new AiExtractionError('provider_unavailable', sdkError.message, sdkError.requestID);
        }
      }
      throw error;
    }

    const usage: AiProviderUsage = {
      promptTokens: response.usage?.input_tokens ?? 0,
      completionTokens: response.usage?.output_tokens ?? 0,
      cachedTokens: response.usage?.input_tokens_details?.cached_tokens,
      serviceTier: response.service_tier,
    };

    // Check for refusal
    if (response.refusal) {
      throw new AiExtractionError('refusal', response.refusal, response.id, undefined, usage);
    }

    // Check for incomplete response
    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      const failureType = reason === 'max_output_tokens' ? 'max_tokens' : 'timeout';
      throw new AiExtractionError(
        failureType,
        `Incomplete response: ${reason}`,
        response.id,
        undefined,
        usage,
      );
    }

    // Use SDK-parsed output
    if (!response.output_parsed) {
      throw new AiExtractionError(
        'schema_mismatch',
        'No parsed output in response',
        response.id,
        undefined,
        usage,
      );
    }

    try {
      const parsed = aiExtractionResponseSchema.parse(
        response.output_parsed,
      ) as AiExtractionResponse;
      return {
        response: parsed,
        usage,
        rateLimit,
      };
    } catch (error) {
      throw new AiExtractionError(
        'schema_mismatch',
        `Schema validation failed: ${(error as Error).message}`,
        response.id,
        undefined,
        usage,
      );
    }
  }
}

// Keep SDK imports dynamic so importing core does not require the optional OpenAI peer.
type ChatCompletion = {
  id: string;
  choices: {
    finish_reason: string;
    message: { content: string | null; refusal?: string | null };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  service_tier?: string | null;
};

/** Adapt chat output before the shared schema validation and billed-failure handling. */
function normalizeChatCompletion(response: ChatCompletion) {
  const choice = response.choices[0];
  let parsed: unknown = null;
  if (choice?.message.content) {
    try {
      parsed = JSON.parse(choice.message.content);
    } catch {
      /* Schema failure below retains usage. */
    }
  }
  return {
    id: response.id,
    refusal:
      choice?.message.refusal ||
      (choice?.finish_reason === 'content_filter' ? 'Content filtered' : undefined),
    status: choice?.finish_reason === 'length' ? 'incomplete' : 'completed',
    incomplete_details: { reason: 'max_output_tokens' },
    output_parsed: parsed,
    usage: {
      input_tokens: response.usage?.prompt_tokens,
      output_tokens: response.usage?.completion_tokens,
      input_tokens_details: { cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens },
    },
    service_tier: response.service_tier,
  };
}
