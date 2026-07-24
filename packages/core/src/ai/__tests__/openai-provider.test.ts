import { describe, expect, it } from 'vitest';

import { OpenAiProvider } from '../providers/openai.js';

describe('OpenAI provider client policy', () => {
  it('passes zero retries through to the real SDK client', async () => {
    const provider = await OpenAiProvider.create('test-api-key', 'gpt-5.4-mini', 0);
    const client = (provider as unknown as { client: { maxRetries: number } }).client;

    expect(client.maxRetries).toBe(0);
  });
});
