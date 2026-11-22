import { describe, expect, it, vi } from 'vitest';

import { createAiProvider, createInteractiveAiProvider } from '../providers/factory.js';
import { OpenAiProvider, buildOpenAiRequestParams } from '../providers/openai.js';

describe('OpenAI provider client policy', () => {
  it('passes zero retries through to the real SDK client', async () => {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', { maxRetries: 0 });
    const client = (provider as unknown as { client: { maxRetries: number } }).client;

    expect(client.maxRetries).toBe(0);
  });
});

describe('OpenAI transient request failures', () => {
  async function rejectRequest(error: unknown) {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', { maxRetries: 0 });
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

describe('OpenAI response usage', () => {
  const output = {
    title: 'Synthetic',
    correspondent: null,
    documentType: null,
    tags: [],
    customFields: [],
    confidence: { title: 0.9, correspondent: 0, documentType: 0, tags: 0 },
    evidence: 'Synthetic evidence',
  };
  const usage = {
    promptTokens: 3000,
    completionTokens: 50,
    cachedTokens: 2000,
    serviceTier: 'flex',
  };
  async function respond(overrides: Record<string, unknown> = {}) {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', { maxRetries: 0 });
    const client = (provider as unknown as { client: { responses: { parse: unknown } } }).client;
    client.responses.parse = vi.fn(() => ({
      withResponse: async () => ({
        data: {
          id: 'response-test',
          status: 'completed',
          output_parsed: output,
          usage: {
            input_tokens: 3000,
            output_tokens: 50,
            input_tokens_details: { cached_tokens: 2000 },
          },
          service_tier: 'flex',
          ...overrides,
        },
        response: { headers: new Headers() },
      }),
    }));
    return provider.extract({
      systemPrompt: 'Synthetic system prompt',
      userPrompt: 'Synthetic content',
    });
  }
  it('returns cached tokens and the tier reported by the response', async () => {
    await expect(respond()).resolves.toMatchObject({ response: output, usage });
  });
  it.each([
    [{ refusal: 'Synthetic refusal' }, 'refusal'],
    [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'max_tokens'],
    [{ status: 'incomplete', incomplete_details: { reason: 'unknown' } }, 'timeout'],
    [{ output_parsed: null }, 'schema_mismatch'],
    [{ output_parsed: { ...output, tags: 'invalid' } }, 'schema_mismatch'],
  ])('attaches billed usage to a rejected response %j', async (overrides, failureType) => {
    await expect(respond(overrides)).rejects.toMatchObject({
      failureType,
      requestId: 'response-test',
      usage,
    });
  });
});

describe('OpenAI-compatible base URL', () => {
  it('passes the configured base URL to the client and disables flex processing', async () => {
    for (const create of [createAiProvider, createInteractiveAiProvider]) {
      const provider = await create(undefined, 'synthetic-local-model', {
        baseURL: 'http://localhost:11434/v1',
        maxRetries: 0,
        flexProcessing: true,
      });
      const client = (
        provider as unknown as {
          client: {
            baseURL: string;
            apiKey: string;
            timeout: number;
            maxRetries: number;
            responses: { parse: unknown };
          };
        }
      ).client;
      expect(client.baseURL).toBe('http://localhost:11434/v1');
      expect(client.apiKey).toBeTruthy();
      expect(client.timeout).toBe(60000);
      expect(client.maxRetries).toBe(0);
      const parse = vi.fn((_params: Record<string, unknown>) => ({
        withResponse: async () => ({
          data: {
            status: 'completed',
            output_parsed: {
              title: 'Synthetic',
              correspondent: null,
              documentType: null,
              tags: [],
              customFields: [],
              confidence: { title: 0.9, correspondent: 0, documentType: 0, tags: 0 },
              evidence: 'Synthetic evidence',
            },
          },
          response: { headers: new Headers() },
        }),
      }));
      client.responses.parse = parse;
      await expect(
        provider.extract({ systemPrompt: 'Classify', userPrompt: 'Synthetic content' }),
      ).resolves.toMatchObject({ response: { title: 'Synthetic' } });
      expect(parse.mock.calls[0]?.[0]).not.toHaveProperty('service_tier');
    }
  });

  it('preserves default client policy and explicit credentials with the options form', async () => {
    const provider = await createAiProvider('synthetic-key', 'synthetic-model', {
      maxRetries: 4,
    });
    const client = (
      provider as unknown as {
        client: {
          baseURL: string;
          apiKey: string;
          timeout: number;
          maxRetries: number;
          responses: { parse: unknown };
        };
      }
    ).client;
    expect(client.baseURL).toBe('https://api.openai.com/v1');
    expect(client.apiKey).toBe('synthetic-key');
    expect(client.timeout).toBe(900000);
    expect(client.maxRetries).toBe(4);
    const parse = vi.fn((_params: Record<string, unknown>) => ({
      withResponse: async () => ({
        data: { refusal: 'Synthetic refusal' },
        response: { headers: new Headers() },
      }),
    }));
    client.responses.parse = parse;
    await expect(
      provider.extract({ systemPrompt: 'Classify', userPrompt: 'Synthetic content' }),
    ).rejects.toMatchObject({ failureType: 'refusal' });
    expect(parse.mock.calls[0][0]).toMatchObject({
      model: 'synthetic-model',
      service_tier: 'flex',
      input: [
        { role: 'developer', content: 'Classify' },
        { role: 'user', content: 'Synthetic content' },
      ],
    });
    const local = await createAiProvider('synthetic-key', 'synthetic-model', {
      baseURL: 'https://example.test/v1',
      flexProcessing: false,
    });
    expect((local as unknown as { client: { apiKey: string } }).client.apiKey).toBe(
      'synthetic-key',
    );
  });
});

describe('custom endpoint request parameters', () => {
  const local = 'http://localhost:11434/v1';
  const base = { systemPrompt: 'Classify', userPrompt: 'Synthetic content', maxOutputTokens: 321 };

  it('sends reasoning none explicitly in chat style only with a base URL', async () => {
    const request = { ...base, reasoningEffort: 'none' as const };
    const custom = await buildOpenAiRequestParams(request, 'm', false, {
      apiStyle: 'chat',
      baseURL: local,
    });
    expect(custom.reasoning_effort).toBe('none');
    const stock = await buildOpenAiRequestParams(request, 'm', true, { apiStyle: 'chat' });
    expect(stock).not.toHaveProperty('reasoning_effort');
  });

  it('sends reasoning none explicitly in responses style only with a base URL', async () => {
    const request = { ...base, reasoningEffort: 'none' as const };
    const custom = await buildOpenAiRequestParams(request, 'm', false, { baseURL: local });
    expect(custom.reasoning).toEqual({ effort: 'none' });
    const stock = await buildOpenAiRequestParams(request, 'm', true, {});
    expect(stock).not.toHaveProperty('reasoning');
  });

  it('sends max_tokens beside max_completion_tokens in chat style with a base URL', async () => {
    const custom = await buildOpenAiRequestParams(base, 'm', false, {
      apiStyle: 'chat',
      baseURL: local,
    });
    expect(custom).toMatchObject({ max_tokens: 321, max_completion_tokens: 321 });
    const stock = await buildOpenAiRequestParams(base, 'm', true, { apiStyle: 'chat' });
    expect(stock).not.toHaveProperty('max_tokens');
    expect(stock.max_completion_tokens).toBe(321);
    const responses = await buildOpenAiRequestParams(base, 'm', false, { baseURL: local });
    expect(responses).not.toHaveProperty('max_tokens');
    expect(responses.max_output_tokens).toBe(321);
  });

  it('uses the configured timeout for the client, with and without a base URL', async () => {
    const timeoutOf = async (options: Record<string, unknown>) =>
      (
        (await OpenAiProvider.create('k', 'm', options)) as unknown as {
          client: { timeout: number };
        }
      ).client.timeout;
    expect(await timeoutOf({ baseURL: local, timeoutMs: 180_000 })).toBe(180_000);
    expect(await timeoutOf({ timeoutMs: 45_000 })).toBe(45_000);
    expect(await timeoutOf({ baseURL: local })).toBe(60_000);
    expect(await timeoutOf({})).toBe(900_000);
  });
});
