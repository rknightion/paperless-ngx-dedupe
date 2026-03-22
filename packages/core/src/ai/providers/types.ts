import { z } from 'zod';

export interface AiExtractionRequest {
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface AiExtractionResponse {
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  confidence: {
    correspondent: number;
    documentType: number;
    tags: number;
  };
  evidence: string;
}

export interface AiProviderUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
}

export interface AiExtractionResult {
  response: AiExtractionResponse;
  usage: AiProviderUsage;
}

export interface AiProviderInterface {
  readonly provider: 'openai' | 'anthropic';
  extract(request: AiExtractionRequest): Promise<AiExtractionResult>;
}

export type AiFailureType = 'refusal' | 'schema_mismatch' | 'timeout' | 'max_tokens' | 'rate_limit';

export class AiExtractionError extends Error {
  constructor(
    public readonly failureType: AiFailureType,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AiExtractionError';
  }
}

export const aiExtractionResponseSchema = z.object({
  correspondent: z.string().nullable(),
  documentType: z.string().nullable(),
  tags: z.array(z.string()).max(5),
  confidence: z.object({
    correspondent: z.number().min(0).max(1),
    documentType: z.number().min(0).max(1),
    tags: z.number().min(0).max(1),
  }),
  evidence: z.string(),
});

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    correspondent: {
      type: ['string', 'null'] as const,
      description: 'The person or organization this document relates to, or null if unclear',
    },
    documentType: {
      type: ['string', 'null'] as const,
      description:
        'The category of document (e.g., Invoice, Receipt, Contract), or null if unclear',
    },
    tags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Up to 5 relevant descriptive labels',
      maxItems: 5,
    },
    confidence: {
      type: 'object' as const,
      properties: {
        correspondent: {
          type: 'number' as const,
          description: 'Confidence score for the correspondent classification (0.0 to 1.0)',
          minimum: 0,
          maximum: 1,
        },
        documentType: {
          type: 'number' as const,
          description: 'Confidence score for the document type classification (0.0 to 1.0)',
          minimum: 0,
          maximum: 1,
        },
        tags: {
          type: 'number' as const,
          description: 'Confidence score for the tag classifications (0.0 to 1.0)',
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['correspondent', 'documentType', 'tags'] as const,
      additionalProperties: false,
    },
    evidence: {
      type: 'string' as const,
      description:
        'Short evidence snippet from the document text supporting the classification decisions',
      maxLength: 500,
    },
  },
  required: ['correspondent', 'documentType', 'tags', 'confidence', 'evidence'] as const,
  additionalProperties: false,
};
