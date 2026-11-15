import { describe, it, expect, vi } from 'vitest';
import { processDocument } from '../extract.js';
import type { AiProviderInterface, AiExtractionResult } from '../providers/types.js';
import { AiExtractionError } from '../providers/types.js';
import { AiBudgetInvariantError } from '../budget.js';

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
  customFields: [],
  extractCustomFields: false,
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

  it('reserves scheduled budget before the provider request and reconciles actual usage', async () => {
    const order: string[] = [];
    const provider = createMockProvider();
    vi.mocked(provider.extract).mockImplementation(async () => {
      order.push('request');
      return {
        response: {
          title: 'Title',
          correspondent: null,
          documentType: null,
          tags: [],
          confidence: { title: 1, correspondent: 0, documentType: 0, tags: 0 },
          evidence: '',
        },
        usage: { promptTokens: 101, completionTokens: 17 },
      };
    });
    const requestBudget = {
      reserve: vi.fn(async (request) => {
        order.push('reserve');
        expect(request).toMatchObject({
          requestKey: 'doc-1',
          extractionRequest: {
            maxOutputTokens: 777,
            systemPrompt: expect.any(String),
            userPrompt: expect.any(String),
          },
        });
        return { id: 'reservation-1' };
      }),
      settleFailure: vi.fn(),
      reconcile: vi.fn(async (reservation, usage) => {
        order.push('reconcile');
        expect(reservation).toEqual({ id: 'reservation-1' });
        expect(usage).toEqual({ promptTokens: 101, completionTokens: 17 });
      }),
    };

    await processDocument({
      ...baseOptions,
      provider,
      maxOutputTokens: 777,
      budgetRequestKey: 'doc-1',
      requestBudget,
    });

    expect(order).toEqual(['reserve', 'request', 'reconcile']);
    expect(provider.extract).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 777 }),
    );
  });

  it('rejects an invalid custom-field prompt before budget reservation or provider invocation', async () => {
    const provider = createMockProvider();
    const requestBudget = {
      reserve: vi.fn(),
      reconcile: vi.fn(),
      settleFailure: vi.fn(),
    };

    await expect(
      processDocument({
        ...baseOptions,
        provider,
        extractCustomFields: true,
        customFields: [
          {
            id: 7,
            name: '💷'.repeat(65),
            dataType: 'string',
            extraData: { selectOptions: [] },
            documentCount: 0,
          },
        ],
        budgetRequestKey: 'doc-invalid-policy',
        requestBudget,
      }),
    ).rejects.toMatchObject({ code: 'invalid_definition' });

    expect(requestBudget.reserve).not.toHaveBeenCalled();
    expect(provider.extract).not.toHaveBeenCalled();
  });
});

describe('scheduled request settlement', () => {
  function budget() {
    return {
      reserve: vi.fn().mockResolvedValue({ id: 'reserved-request' }),
      reconcile: vi.fn().mockResolvedValue(undefined),
      settleFailure: vi.fn().mockResolvedValue(undefined),
    };
  }

  it.each(['rate_limit', 'quota_exceeded'] as const)(
    'settles %s once and preserves the provider error',
    async (failureType) => {
      const error = new AiExtractionError(failureType, 'Synthetic rejection');
      const requestBudget = budget();
      await expect(
        processDocument({
          ...baseOptions,
          provider: createMockProvider({ extractError: error }),
          requestBudget,
          budgetRequestKey: 'request',
        }),
      ).rejects.toBe(error);
      expect(requestBudget.settleFailure).toHaveBeenCalledExactlyOnceWith(
        { id: 'reserved-request' },
        error,
      );
      expect(requestBudget.reconcile).not.toHaveBeenCalled();
    },
  );

  it('preserves the provider error even when failure settlement also throws', async () => {
    const error = new AiExtractionError('rate_limit', 'Synthetic rejection');
    const requestBudget = budget();
    requestBudget.settleFailure.mockRejectedValue(new Error('Synthetic settlement failure'));
    await expect(
      processDocument({
        ...baseOptions,
        provider: createMockProvider({ extractError: error }),
        requestBudget,
        budgetRequestKey: 'request',
      }),
    ).rejects.toBe(error);
    expect(requestBudget.settleFailure).toHaveBeenCalledExactlyOnceWith(
      { id: 'reserved-request' },
      error,
    );
  });

  it('retains a paid extraction when reconciliation reports a budget invariant error', async () => {
    const provider = createMockProvider();
    const requestBudget = budget();
    requestBudget.reconcile.mockRejectedValue(new AiBudgetInvariantError());
    const result = await processDocument({
      ...baseOptions,
      provider,
      requestBudget,
      budgetRequestKey: 'request',
    });
    expect(result).toBe(await vi.mocked(provider.extract).mock.results[0].value);
    expect(requestBudget.settleFailure).not.toHaveBeenCalled();
  });

  it('still propagates other reconciliation failures', async () => {
    const error = new Error('Synthetic database failure');
    const requestBudget = budget();
    requestBudget.reconcile.mockRejectedValue(error);
    await expect(
      processDocument({
        ...baseOptions,
        provider: createMockProvider(),
        requestBudget,
        budgetRequestKey: 'request',
      }),
    ).rejects.toBe(error);
    expect(requestBudget.settleFailure).not.toHaveBeenCalled();
  });

  it('does not settle when reservation itself fails', async () => {
    const error = new Error('Synthetic reservation failure');
    const requestBudget = budget();
    requestBudget.reserve.mockRejectedValue(error);
    const provider = createMockProvider();
    await expect(
      processDocument({ ...baseOptions, provider, requestBudget, budgetRequestKey: 'request' }),
    ).rejects.toBe(error);
    expect(provider.extract).not.toHaveBeenCalled();
    expect(requestBudget.settleFailure).not.toHaveBeenCalled();
  });
});
