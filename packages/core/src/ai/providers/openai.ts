import type {
  AiProviderInterface,
  AiExtractionRequest,
  AiExtractionResult,
  AiExtractionResponse,
} from './types.js';
import { AiExtractionError, aiExtractionResponseSchema } from './types.js';

export class OpenAiProvider implements AiProviderInterface {
  readonly provider = 'openai' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private model: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(client: any, model: string) {
    this.client = client;
    this.model = model;
  }

  static async create(apiKey: string, model: string, maxRetries = 3): Promise<OpenAiProvider> {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey, maxRetries, timeout: 60_000 });
      return new OpenAiProvider(client, model);
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

    if (request.reasoningEffort && request.reasoningEffort !== 'none') {
      params.reasoning = { effort: request.reasoningEffort };
    }

    const response = await this.client.responses.parse(params);

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
