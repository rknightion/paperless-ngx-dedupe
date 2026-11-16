import { describe, expect, it, vi } from 'vitest';
import { createAiProvider } from '../providers/factory.js';
import { aiExtractionResponseSchema } from '../providers/types.js';
import { parseConfig } from '../../config.js';
import { getConfigMetadata } from '../../config/registry.js';

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
  serviceTier: 'default',
};
async function setup(choice: Record<string, unknown> = {}, error?: unknown) {
  const provider = await createAiProvider(undefined, 'synthetic-model', {
    baseURL: 'http://localhost:11434/v1',
    apiStyle: 'chat',
    maxRetries: 0,
  });
  const client = (
    provider as unknown as {
      client: { chat: { completions: { create: unknown } }; responses: { parse: unknown } };
    }
  ).client;
  const create = vi.fn((_params: Record<string, unknown>) => ({
    withResponse: async () => {
      if (error) throw error;
      return {
        data: {
          id: 'synthetic-chat',
          choices: [
            { message: { content: JSON.stringify(output) }, finish_reason: 'stop', ...choice },
          ],
          usage: {
            prompt_tokens: 3000,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 2000 },
          },
          service_tier: 'default',
        },
        response: {
          headers: new Headers({
            'x-ratelimit-limit-tokens': '10000',
            'x-ratelimit-remaining-tokens': '7000',
          }),
        },
      };
    },
  }));
  client.chat.completions.create = create;
  const responses = vi.fn(() => {
    throw new Error('Responses API must not be called in chat mode');
  });
  client.responses.parse = responses;
  return { provider, create, responses };
}
const request = {
  systemPrompt: 'Classify',
  userPrompt: 'Synthetic content',
  maxOutputTokens: 123,
  reasoningEffort: 'low' as const,
};
describe('OpenAI chat extraction', () => {
  it('uses chat structured output with the same schema and preserves usage and rate limits', async () => {
    const { provider, create, responses } = await setup();
    await expect(provider.extract(request)).resolves.toMatchObject({
      response: output,
      usage,
      rateLimit: { limitTokens: 10000, remainingTokens: 7000 },
    });
    const params = create.mock.calls[0][0];
    const { zodResponseFormat } = await import('openai/helpers/zod');
    expect(JSON.parse(JSON.stringify(params))).toEqual({
      model: 'synthetic-model',
      messages: [
        { role: 'system', content: 'Classify' },
        { role: 'user', content: 'Synthetic content' },
      ],
      max_completion_tokens: 123,
      reasoning_effort: 'low',
      response_format: JSON.parse(
        JSON.stringify(zodResponseFormat(aiExtractionResponseSchema, 'document_classification')),
      ),
    });
    expect(responses).not.toHaveBeenCalled();
  });
  it.each([
    [{ message: { refusal: 'Synthetic refusal', content: null } }, 'refusal'],
    [{ finish_reason: 'length' }, 'max_tokens'],
    [{ finish_reason: 'content_filter' }, 'refusal'],
    [{ message: { content: 'invalid json' } }, 'schema_mismatch'],
    [{ message: { content: JSON.stringify({ ...output, tags: 'invalid' }) } }, 'schema_mismatch'],
    [{ message: { content: null } }, 'schema_mismatch'],
  ])('preserves billed usage for rejected output %j', async (choice, failureType) => {
    const { provider } = await setup(choice);
    await expect(provider.extract(request)).rejects.toMatchObject({
      failureType,
      usage,
      requestId: 'synthetic-chat',
    });
  });
  it.each([
    [
      { status: 429, message: 'Limited', headers: new Headers({ 'retry-after': '0.25' }) },
      { failureType: 'rate_limit', retryAfterMs: 250 },
    ],
    [
      { status: 429, message: 'Quota', code: 'insufficient_quota' },
      { failureType: 'quota_exceeded' },
    ],
    [{ status: 503, message: 'Unavailable' }, { failureType: 'provider_unavailable' }],
  ])('uses existing HTTP failure classification %j', async (error, expected) => {
    const { provider } = await setup({}, error);
    await expect(provider.extract(request)).rejects.toMatchObject(expected);
  });
  it('defaults to responses and validates the published environment setting', () => {
    const env = { PAPERLESS_URL: 'http://localhost:8000', PAPERLESS_API_TOKEN: 'synthetic' };
    expect(parseConfig(env).AI_OPENAI_API_STYLE).toBe('responses');
    expect(parseConfig({ ...env, AI_OPENAI_API_STYLE: 'chat' }).AI_OPENAI_API_STYLE).toBe('chat');
    expect(() => parseConfig({ ...env, AI_OPENAI_API_STYLE: 'invalid' })).toThrow();
    expect(getConfigMetadata().find((entry) => entry.key === 'AI_OPENAI_API_STYLE')).toMatchObject({
      source: 'environment',
      sensitive: false,
      readOnly: true,
    });
  });
});
