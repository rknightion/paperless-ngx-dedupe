import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it.each(['https://api.openai.com/v1', 'https://example-resource.openai.azure.com/openai/v1'])(
    'omits max_tokens in chat style when the base URL is an OpenAI host (%s)',
    async (baseURL) => {
      const params = await buildOpenAiRequestParams(base, 'm', false, {
        apiStyle: 'chat',
        baseURL,
      });
      expect(params).not.toHaveProperty('max_tokens');
      expect(params.max_completion_tokens).toBe(321);
    },
  );

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

describe('Cloudflare AI Gateway route', () => {
  const gateway = 'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/openai';
  const request = { systemPrompt: 'Classify', userPrompt: 'Synthetic content' };

  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const text = JSON.stringify({
      title: 'Synthetic',
      correspondent: null,
      documentType: null,
      tags: [],
      customFields: [],
      confidence: { title: 0.9, correspondent: 0, documentType: 0, tags: 0 },
      evidence: 'Synthetic evidence',
    });
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(
          JSON.stringify({
            id: 'response-test',
            object: 'response',
            status: 'completed',
            model: 'gpt-6-luna',
            service_tier: 'flex',
            output: [
              {
                id: 'message-test',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text, annotations: [] }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function send(apiKey: string | undefined, baseURL: string, gatewayToken?: string) {
    const fetchMock = stubFetch();
    const provider = await OpenAiProvider.create(apiKey, 'gpt-6-luna', {
      maxRetries: 0,
      baseURL,
      gatewayToken,
    });
    await provider.extract(request);
    const [input, init] = fetchMock.mock.calls[0];
    return {
      url: String(input),
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
      body: JSON.parse(String(init?.body)),
    };
  }

  it('authenticates to the gateway, uses its stored key and keeps text out of its logs', async () => {
    const sent = await send(undefined, gateway, 'gateway-token');
    expect(sent.url).toBe(gateway + '/responses');
    expect(sent.headers.get('cf-aig-authorization')).toBe('Bearer gateway-token');
    expect(sent.headers.has('authorization')).toBe(false);
    expect(sent.headers.get('cf-aig-collect-log-payload')).toBe('false');
    expect(sent.headers.get('cf-aig-skip-cache')).toBe('true');
    expect(sent.redirect).toBe('error');
    expect(sent.body.service_tier).toBe('flex');
  });

  it('forwards a configured provider key through the gateway', async () => {
    const sent = await send('provider-key', gateway, 'gateway-token');
    expect(sent.headers.get('authorization')).toBe('Bearer provider-key');
    expect(sent.headers.get('cf-aig-authorization')).toBe('Bearer gateway-token');
  });

  it('recognises a custom-domain gateway from its token', async () => {
    const sent = await send(undefined, 'https://ai.example.test/openai/v1', 'gateway-token');
    expect(sent.url).toBe('https://ai.example.test/openai/v1/responses');
    expect(sent.headers.get('cf-aig-authorization')).toBe('Bearer gateway-token');
    expect(sent.headers.has('authorization')).toBe(false);
    expect(sent.headers.get('cf-aig-collect-log-payload')).toBe('false');
    expect(sent.redirect).toBe('error');
    expect(sent.body.service_tier).toBe('flex');
  });

  it.each([
    'http://localhost:11434/v1',
    'https://ai.example.test/v1',
    'http://ai.example.test/openai/v1',
    'http://gateway.ai.cloudflare.com/v1/account/gateway/openai',
    'https://gateway.ai.cloudflare.com/v1/account/gateway/anthropic',
  ])('never sends the gateway token to %s', async (baseURL) => {
    const sent = await send('provider-key', baseURL, 'gateway-token');
    expect(sent.headers.has('cf-aig-authorization')).toBe(false);
    expect(sent.body).not.toHaveProperty('service_tier');
  });

  it.each([
    ['gpt-6-luna', 'none', 'flex'],
    ['gpt-6.1-terra', 'none', 'flex'],
    ['gpt-6-astra', 'low', 'flex'],
    ['gpt-6.1-sol', 'low', 'flex'],
    ['gpt-6-sol', 'none', 'default'],
    ['gpt-6.2-sol', 'low', 'default'],
    ['gpt-6.2-astra', 'low', 'default'],
    ['gpt-5.4-mini', undefined, 'flex'],
  ])('requests only what %s accepts when reasoning is off', async (model, effort, tier) => {
    for (const options of [{}, { baseURL: gateway }]) {
      const params = await buildOpenAiRequestParams(
        { ...request, reasoningEffort: 'none' },
        model,
        true,
        options,
      );
      expect(params.reasoning?.effort).toBe(effort);
      expect(params.service_tier).toBe(tier);
    }
  });
});
