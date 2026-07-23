import { describe, expect, it } from 'vitest';

import { parseConfig } from '../config.js';

const baseEnv = {
  PAPERLESS_URL: 'https://paperless.example.com',
  PAPERLESS_API_TOKEN: 'test-token',
};

describe('parseConfig', () => {
  it('keeps AI classification configuration independent', () => {
    const config = parseConfig({
      ...baseEnv,
      AI_ENABLED: 'true',
      AI_OPENAI_API_KEY: 'test-key',
    });

    expect(config.AI_ENABLED).toBe(true);
  });

  it('does not expose the retired RAG feature flag', () => {
    const config = parseConfig({
      ...baseEnv,
      RAG_ENABLED: 'true',
      AI_OPENAI_API_KEY: 'test-key',
    });

    expect(config).not.toHaveProperty('RAG_ENABLED');
  });
});
