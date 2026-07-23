import { z } from 'zod';
import type { PaperlessCustomFieldValue } from '../../paperless/types.js';

export interface AiCustomFieldRecommendation {
  fieldId: number;
  fieldName?: string;
  value: PaperlessCustomFieldValue;
  confidence: number;
  evidence: string;
}

export interface AiExtractionRequest {
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface AiExtractionResponse {
  title: string | null;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  customFields?: AiCustomFieldRecommendation[];
  confidence: {
    title: number;
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

export interface RateLimitInfo {
  limitTokens: number;
  remainingTokens: number;
  resetTokensMs: number;
}

export interface AiExtractionResult {
  response: AiExtractionResponse;
  usage: AiProviderUsage;
  rateLimit?: RateLimitInfo;
}

export interface AiProviderInterface {
  readonly provider: 'openai';
  extract(request: AiExtractionRequest): Promise<AiExtractionResult>;
}

export type AiFailureType =
  | 'refusal'
  | 'schema_mismatch'
  | 'timeout'
  | 'max_tokens'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'no_content'
  | 'no_suggestions';

export class AiExtractionError extends Error {
  constructor(
    public readonly failureType: AiFailureType,
    message: string,
    public readonly requestId?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiExtractionError';
  }
}

export const aiExtractionResponseSchema = z.object({
  title: z.string().nullable(),
  correspondent: z.string().nullable(),
  documentType: z.string().nullable(),
  tags: z.array(z.string()).max(5),
  customFields: z.array(
    z.object({
      fieldId: z.number().int(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number()), z.null()]),
      confidence: z.number().min(0).max(1),
      evidence: z.string().max(500),
    }),
  ),
  confidence: z.object({
    title: z.number().min(0).max(1),
    correspondent: z.number().min(0).max(1),
    documentType: z.number().min(0).max(1),
    tags: z.number().min(0).max(1),
  }),
  evidence: z.string(),
});

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {
      type: ['string', 'null'] as const,
      description:
        'A clear, descriptive document name/title, or null if no meaningful title can be determined',
    },
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
    customFields: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          fieldId: { type: 'integer' as const },
          value: {
            anyOf: [
              { type: 'string' as const },
              { type: 'number' as const },
              { type: 'boolean' as const },
              { type: 'array' as const, items: { type: 'integer' as const } },
              { type: 'null' as const },
            ],
          },
          confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
          evidence: { type: 'string' as const, maxLength: 500 },
        },
        required: ['fieldId', 'value', 'confidence', 'evidence'] as const,
        additionalProperties: false,
      },
    },
    confidence: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'number' as const,
          description: 'Confidence score for the suggested title (0.0 to 1.0)',
          minimum: 0,
          maximum: 1,
        },
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
      required: ['title', 'correspondent', 'documentType', 'tags'] as const,
      additionalProperties: false,
    },
    evidence: {
      type: 'string' as const,
      description:
        'Short evidence snippet from the document text supporting the classification decisions',
      maxLength: 500,
    },
  },
  required: [
    'title',
    'correspondent',
    'documentType',
    'tags',
    'customFields',
    'confidence',
    'evidence',
  ] as const,
  additionalProperties: false,
};
