import { describe, it, expect, vi } from 'vitest';
import { processDocument } from '../extract.js';
import type { AiProviderInterface, AiExtractionResult } from '../providers/types.js';
import { AiExtractionError } from '../providers/types.js';

function createMockProvider(
  overrides?: Partial<{
    extractResult: AiExtractionResult;
    extractError: Error;
  }>,
): AiProviderInterface {
  const defaultResult: AiExtractionResult = {
    response: {
      title: 'Amazon Invoice - Jan 2024',
      correspondent: 'Amazon',
      documentType: 'Invoice',
      tags: ['finance'],
      confidence: { title: 0.9, correspondent: 0.9, documentType: 0.95, tags: 0.8 },
      evidence: 'Amazon header',
    },
    usage: { promptTokens: 100, completionTokens: 50 },
  };

  return {
    provider: 'openai',
    extract: overrides?.extractError
      ? vi.fn().mockRejectedValue(overrides.extractError)
      : vi.fn().mockResolvedValue(overrides?.extractResult ?? defaultResult),
  };
}

const baseOptions = {
  documentTitle: 'Invoice #123',
  documentContent: 'Amazon order total £42.99',
  existingCorrespondents: ['Amazon', 'Barclays'],
  existingDocumentTypes: ['Invoice', 'Receipt'],
  existingTags: ['finance', 'shopping'],
  promptTemplate:
    'Classify: {{existing_correspondents}} {{existing_document_types}} {{existing_tags}}',
  maxContentLength: 8000,
  includeCorrespondents: true,
  includeDocumentTypes: true,
  includeTags: true,
  tagAliasesEnabled: false,
  tagAliasMap: '',
};

describe('processDocument', () => {
  it('returns extraction result from provider', async () => {
    const provider = createMockProvider();
    const result = await processDocument({ ...baseOptions, provider });

    expect(result.response.correspondent).toBe('Amazon');
    expect(result.response.documentType).toBe('Invoice');
    expect(result.response.tags).toEqual(['finance']);
    expect(result.usage.promptTokens).toBe(100);
    expect(result.usage.completionTokens).toBe(50);
  });

  it('passes reasoning effort through to provider', async () => {
    const provider = createMockProvider();
    await processDocument({
      ...baseOptions,
      provider,
      reasoningEffort: 'high',
    });

    expect(provider.extract).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'high' }),
    );
  });

  it('truncates long content before extracting', async () => {
    const provider = createMockProvider();
    const longContent = 'x'.repeat(20000);

    await processDocument({
      ...baseOptions,
      provider,
      documentContent: longContent,
      maxContentLength: 500,
    });

    const call = vi.mocked(provider.extract).mock.calls[0][0];
    // The user prompt should contain truncated content, not the full 20k chars
    expect(call.userPrompt.length).toBeLessThan(longContent.length);
    expect(call.userPrompt).toContain('[... middle content truncated ...]');
  });

  it('propagates provider errors', async () => {
    const error = new AiExtractionError('timeout', 'Request timed out', 'req-123');
    const provider = createMockProvider({ extractError: error });

    await expect(processDocument({ ...baseOptions, provider })).rejects.toThrow(AiExtractionError);
    await expect(processDocument({ ...baseOptions, provider })).rejects.toThrow(
      'Request timed out',
    );
  });

  it('builds prompt with plain text format', async () => {
    const provider: AiProviderInterface = {
      provider: 'openai',
      extract: vi.fn().mockResolvedValue({
        response: {
          correspondent: 'Amazon',
          documentType: 'Invoice',
          tags: [],
          confidence: { correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 50, completionTokens: 25 },
      }),
    };

    await processDocument({ ...baseOptions, provider });

    const call = vi.mocked(provider.extract).mock.calls[0][0];
    // Provider should produce plain text prompts
    expect(call.systemPrompt).not.toContain('<instructions>');
    expect(call.userPrompt).toContain('Document Title');
    expect(call.userPrompt).not.toContain('<document>');
  });
});
