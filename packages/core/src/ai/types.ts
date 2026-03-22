import { z } from 'zod';

export const AI_CONFIG_PREFIX = 'ai.';

export const DEFAULT_EXTRACTION_PROMPT = `You are a document classification assistant for Paperless-NGX, a document management system.
Analyze the document and extract classification metadata.

## Task
Given the document text, determine:
1. **Correspondent**: The person or organization this document relates to (sender, author, or primary entity)
2. **Document Type**: The category/kind of document (e.g., Invoice, Receipt, Contract, Letter, Bank Statement, Report)
3. **Tags**: Up to 5 relevant descriptive labels

## Naming Guidelines
- **Correspondents**: Use the shortest commonly-used version of the name. Use the well-known brand or trading name, not the full legal entity.
  - "Amazon" not "Amazon Eu SaRL" or "Amazon.com Inc."
  - "Barclays" not "Barclays Bank UK LTD"
  - "HMRC" not "HM Revenue & Customs"
  - For individuals, use "Firstname Lastname" format
- **Document Types**: Use clear, standard categories: Invoice, Receipt, Contract, Letter, Bank Statement, Pay Slip, Tax Return, Insurance Policy, Utility Bill, Medical Record, Report, Certificate, Notification
- **Tags**: Use concise, lowercase, hyphenated labels (e.g., "tax-2024", "insurance", "medical", "home-improvement"). Avoid redundant tags that duplicate the correspondent or document type.

## Rules
- Set correspondent/documentType to null if the document does not clearly indicate one
- Provide confidence scores (0.0-1.0): use lower values when uncertain
- Do NOT infer information not present in the document text
- Provide a short evidence snippet from the document text supporting each classification in the "evidence" field

{{referenceData}}

{{examples}}

## Document Title
{{title}}

## Document Text
{{content}}`;

export const OPENAI_MODELS = [
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
] as const;

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
] as const;

export const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().default('gpt-5.4-mini'),
  promptTemplate: z.string().default(DEFAULT_EXTRACTION_PROMPT),
  maxContentLength: z.number().int().min(500).max(100000).default(8000),
  batchSize: z.number().int().min(1).max(100).default(10),
  rateDelayMs: z.number().int().min(0).max(60000).default(500),
  autoProcess: z.boolean().default(false),
  processedTagName: z.string().default('ai-processed'),
  addProcessedTag: z.boolean().default(false),
  includeCorrespondents: z.boolean().default(false),
  includeDocumentTypes: z.boolean().default(false),
  includeTags: z.boolean().default(false),
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).default('low'),
  maxRetries: z.number().int().min(0).max(10).default(3),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = aiConfigSchema.parse({});

export interface AiBatchResult {
  totalDocuments: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationMs: number;
}
