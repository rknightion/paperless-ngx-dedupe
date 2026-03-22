import type {
  AiProviderInterface,
  AiExtractionRequest,
  AiExtractionResult,
  AiExtractionResponse,
} from './types.js';
import { AiExtractionError, aiExtractionResponseSchema, EXTRACTION_JSON_SCHEMA } from './types.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ai-anthropic');

export class AnthropicProvider implements AiProviderInterface {
  readonly provider = 'anthropic' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private model: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(client: any, model: string) {
    this.client = client;
    this.model = model;
  }

  static async create(apiKey: string, model: string, maxRetries = 3): Promise<AnthropicProvider> {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey, maxRetries, timeout: 60_000 });
      return new AnthropicProvider(client, model);
    } catch {
      throw new Error('Anthropic SDK not installed. Install it with: pnpm add @anthropic-ai/sdk');
    }
  }

  async extract(request: AiExtractionRequest): Promise<AiExtractionResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: request.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: request.userPrompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: EXTRACTION_JSON_SCHEMA,
        },
      },
    });

    // Check stop reason
    if (message.stop_reason === 'max_tokens') {
      throw new AiExtractionError(
        'max_tokens',
        'Response truncated: max_tokens reached',
        message.id,
      );
    }

    // Check for empty content (refusal equivalent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlock = message.content.find((b: any) => b.type === 'text');
    if (!textBlock) {
      throw new AiExtractionError('refusal', 'No text block in Anthropic response', message.id);
    }

    // Log cache metrics
    const cacheRead = message.usage?.cache_read_input_tokens;
    const cacheCreation = message.usage?.cache_creation_input_tokens;
    if (cacheRead || cacheCreation) {
      logger.debug({ cacheRead, cacheCreation, messageId: message.id }, 'Anthropic cache metrics');
    }

    try {
      const raw = JSON.parse(textBlock.text);
      const parsed = aiExtractionResponseSchema.parse(raw) as AiExtractionResponse;

      return {
        response: parsed,
        usage: {
          promptTokens: message.usage?.input_tokens ?? 0,
          completionTokens: message.usage?.output_tokens ?? 0,
          cachedTokens: cacheRead,
        },
      };
    } catch (error) {
      throw new AiExtractionError(
        'schema_mismatch',
        `Response parsing failed: ${(error as Error).message}`,
        message.id,
      );
    }
  }
}
