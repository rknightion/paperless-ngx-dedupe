import type { AiProviderInterface, AiExtractionResult } from './providers/types.js';
import { buildPromptParts, truncateContent } from './prompt.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ai-extract');

export interface ProcessDocumentOptions {
  provider: AiProviderInterface;
  documentTitle: string;
  documentContent: string;
  existingCorrespondents: string[];
  existingDocumentTypes: string[];
  existingTags: string[];
  promptTemplate: string;
  maxContentLength: number;
  includeCorrespondents: boolean;
  includeDocumentTypes: boolean;
  includeTags: boolean;
  tagAliasesEnabled: boolean;
  tagAliasMap: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export async function processDocument(
  options: ProcessDocumentOptions,
): Promise<AiExtractionResult> {
  const truncatedContent = truncateContent(options.documentContent, options.maxContentLength);

  const { systemPrompt, userPrompt } = buildPromptParts({
    promptTemplate: options.promptTemplate,
    documentTitle: options.documentTitle,
    documentContent: truncatedContent,
    existingCorrespondents: options.existingCorrespondents,
    existingDocumentTypes: options.existingDocumentTypes,
    existingTags: options.existingTags,
    includeCorrespondents: options.includeCorrespondents,
    includeDocumentTypes: options.includeDocumentTypes,
    includeTags: options.includeTags,
    tagAliasesEnabled: options.tagAliasesEnabled,
    tagAliasMap: options.tagAliasMap,
  });

  const startMs = performance.now();
  try {
    const result = await options.provider.extract({
      systemPrompt,
      userPrompt,
      reasoningEffort: options.reasoningEffort,
    });
    const durationMs = Math.round(performance.now() - startMs);
    logger.info(
      {
        title: options.documentTitle,
        durationMs,
        provider: options.provider.provider,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        ...(result.usage.cachedTokens ? { cachedTokens: result.usage.cachedTokens } : {}),
      },
      'Document processed successfully',
    );
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startMs);
    logger.error(
      { title: options.documentTitle, durationMs, error: (error as Error).message },
      'Document processing failed',
    );
    throw error;
  }
}
