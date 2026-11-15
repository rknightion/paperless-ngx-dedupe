import { describe, expect, it, vi } from 'vitest';

import { OpenAiProvider } from '../providers/openai.js';

describe('OpenAI provider client policy', () => {
  it('passes zero retries through to the real SDK client', async () => {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', 0);
    const client = (provider as unknown as { client: { maxRetries: number } }).client;

    expect(client.maxRetries).toBe(0);
  });
});

describe('OpenAI transient request failures', () => {
  async function rejectRequest(error: unknown) {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', 0);
    const client = (provider as unknown as { client: { responses: { parse: unknown } } }).client;
    client.responses.parse = vi.fn(() => ({ withResponse: () => Promise.reject(error) }));
    return provider.extract({
      systemPrompt: 'Classify a synthetic document',
      userPrompt: 'Synthetic content',
    });
  }

  it.each([408, 409, 500, 503, 599])(
    'classifies HTTP %s as provider unavailable',
    async (status) => {
      await expect(
        rejectRequest({ status, message: 'Synthetic upstream failure', requestID: 'request-test' }),
      ).rejects.toMatchObject({
        name: 'AiExtractionError',
        failureType: 'provider_unavailable',
        message: 'Synthetic upstream failure',
        requestId: 'request-test',
      });
    },
  );

  it('classifies SDK connection and timeout errors as provider unavailable', async () => {
    const { APIConnectionError, APIConnectionTimeoutError } = await import('openai');
    for (const error of [new APIConnectionError({}), new APIConnectionTimeoutError({})]) {
      await expect(rejectRequest(error)).rejects.toMatchObject({
        name: 'AiExtractionError',
        failureType: 'provider_unavailable',
        message: error.message,
      });
    }
  });

  it.each([400, 401, 403, 404, 422, '503'])('preserves non-transient status %s', async (status) => {
    const error = { status, message: 'Synthetic permanent failure' };
    await expect(rejectRequest(error)).rejects.toBe(error);
  });

  it('preserves rate-limit retry-after and permanent quota behavior', async () => {
    await expect(
      rejectRequest({
        status: 429,
        message: 'Rate limited',
        headers: new Headers({ 'retry-after': '0.25' }),
      }),
    ).rejects.toMatchObject({ failureType: 'rate_limit', retryAfterMs: 250 });
    await expect(
      rejectRequest({ status: 429, code: 'insufficient_quota', message: 'Quota exhausted' }),
    ).rejects.toMatchObject({ failureType: 'quota_exceeded' });
  });
});
