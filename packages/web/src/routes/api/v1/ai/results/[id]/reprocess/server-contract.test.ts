import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAiProvider: vi.fn(),
  createInteractiveAiProvider: vi.fn(),
  reprocessSingleResult: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...mocks,
  getAiConfig: vi.fn(() => ({ model: 'test-model', maxRetries: 10, flexProcessing: true })),
  PaperlessClient: class {},
  toPaperlessConfig: vi.fn(() => ({})),
}));

import { POST } from './+server';

const provider = { provider: 'openai', extract: vi.fn() };
function request(query: string) {
  return POST({
    params: { id: 'result-test' },
    locals: {
      config: {
        AI_ENABLED: true,
        AI_OPENAI_API_KEY: 'test-api-key',
        AI_OPENAI_API_STYLE: 'responses',
      },
      db: {},
    },
    url: new URL(`http://localhost/api/v1/ai/results/result-test/reprocess${query}`),
  } as never);
}

describe('interactive reprocess HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAiProvider.mockResolvedValue(provider);
    mocks.createInteractiveAiProvider.mockResolvedValue(provider);
  });

  it.each(['', '?mode=inbox'])('preserves the success envelope in mode %s', async (query) => {
    mocks.reprocessSingleResult.mockResolvedValue({ resultId: 'result-test' });
    const response = await request(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { reprocessed: true, resultId: 'result-test' } });
    expect(mocks.createInteractiveAiProvider).toHaveBeenCalledWith('test-api-key', 'test-model', {
      maxRetries: 10,
      baseURL: undefined,
      apiStyle: 'responses',
    });
    expect(mocks.createAiProvider).not.toHaveBeenCalled();
    expect(mocks.reprocessSingleResult).toHaveBeenCalledWith(
      {},
      'result-test',
      expect.objectContaining({
        provider,
        config: { model: 'test-model', maxRetries: 10, flexProcessing: true },
      }),
    );
  });

  it.each(['', '?mode=inbox'])(
    'preserves the missing-result envelope in mode %s',
    async (query) => {
      mocks.reprocessSingleResult.mockRejectedValue(new Error('AI result not found: result-test'));
      const response = await request(query);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
          operation: query ? 'ai_reprocess' : 'api_request',
          retryable: false,
          occurredAt: expect.any(String),
        },
      });
      expect(mocks.createInteractiveAiProvider).toHaveBeenCalledWith('test-api-key', 'test-model', {
        maxRetries: 10,
        baseURL: undefined,
        apiStyle: 'responses',
      });
    },
  );
});

it('reprocesses with a keyless custom endpoint through the interactive factory', async () => {
  mocks.reprocessSingleResult.mockResolvedValue({ resultId: 'local-result' });
  const response = await POST({
    params: { id: 'local-result' },
    locals: {
      config: {
        AI_ENABLED: true,
        AI_OPENAI_BASE_URL: 'http://localhost:11434/v1',
        AI_OPENAI_API_STYLE: 'chat',
      },
      db: {},
    },
    url: new URL('http://localhost/api/v1/ai/results/local-result/reprocess'),
  } as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { reprocessed: true, resultId: 'local-result' } });
  expect(mocks.createInteractiveAiProvider).toHaveBeenLastCalledWith(undefined, 'test-model', {
    maxRetries: 10,
    baseURL: 'http://localhost:11434/v1',
    apiStyle: 'chat',
  });
});
