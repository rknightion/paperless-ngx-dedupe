import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PolicyError extends Error {
    code = 'renamed_field' as const;
    fieldId = 9;
  }
  return {
    PolicyError,
    createAiProvider: vi.fn(),
    markAiResultFailed: vi.fn(),
    reprocessSingleResult: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core', () => ({
  CustomFieldPolicyError: mocks.PolicyError,
  createAiProvider: mocks.createAiProvider,
  getAiConfig: vi.fn(() => ({
    model: 'gpt-5.4-mini',
    maxRetries: 1,
    flexProcessing: true,
  })),
  markAiResultFailed: mocks.markAiResultFailed,
  PaperlessClient: class {},
  reprocessSingleResult: mocks.reprocessSingleResult,
  toPaperlessConfig: vi.fn(() => ({})),
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: {
    BAD_REQUEST: 'BAD_REQUEST',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_FOUND: 'NOT_FOUND',
  },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, context?: unknown, status = code === 'CONFLICT' ? 409 : 500) =>
    Response.json({ error: { code, context } }, { status }),
}));

import { POST } from './+server';

describe('AI result reprocess policy errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAiProvider.mockResolvedValue({ provider: 'openai', extract: vi.fn() });
  });

  it('returns a typed safe conflict without marking the document failed', async () => {
    mocks.reprocessSingleResult.mockRejectedValue(new mocks.PolicyError('private field name'));

    const response = await POST({
      params: { id: 'result-1' },
      locals: {
        config: {
          AI_ENABLED: true,
          AI_OPENAI_API_KEY: 'secret-key',
        },
        db: {},
      },
      url: new URL('http://localhost/api/v1/ai/results/result-1/reprocess?mode=inbox'),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.context.validationIssues).toEqual([
      { path: ['customFields', 9], message: 'renamed_field' },
    ]);
    expect(JSON.stringify(body)).not.toContain('private field name');
    expect(mocks.markAiResultFailed).not.toHaveBeenCalled();
  });

  it('redacts provider failures in inbox mode while preserving the legacy response', async () => {
    mocks.reprocessSingleResult.mockRejectedValue(new Error('PRIVATE_PROVIDER_PAYLOAD'));
    const request = (url: string) =>
      POST({
        params: { id: 'result-1' },
        locals: {
          config: {
            AI_ENABLED: true,
            AI_OPENAI_API_KEY: 'secret-key',
          },
          db: {},
        },
        url: new URL(url),
      } as never);

    const inboxResponse = await request(
      'http://localhost/api/v1/ai/results/result-1/reprocess?mode=inbox',
    );
    const inboxBody = await inboxResponse.json();
    expect(inboxBody.error.context).toEqual({
      operation: 'ai_reprocess',
      retryable: true,
    });
    expect(JSON.stringify(inboxBody)).not.toContain('PRIVATE_PROVIDER_PAYLOAD');

    const legacyResponse = await request('http://localhost/api/v1/ai/results/result-1/reprocess');
    expect(JSON.stringify(await legacyResponse.json())).toContain('PRIVATE_PROVIDER_PAYLOAD');
  });
});
