import { describe, expect, it } from 'vitest';

import { coerceConfigBatch, getConfigMetadata } from '../config/registry.js';

import { parseConfig } from '../config.js';

const baseEnv = {
  PAPERLESS_URL: 'https://paperless.example.com',
  PAPERLESS_API_TOKEN: 'test-token',
};

it('accepts proxy access only with a valid trusted CIDR list and header name', () => {
  expect(
    parseConfig({
      ...baseEnv,
      APP_AUTH_MODE: 'proxy',
      APP_AUTH_TRUSTED_PROXIES: '192.0.2.0/24, 2001:db8::/32',
    }),
  ).toMatchObject({
    APP_AUTH_MODE: 'proxy',
    APP_AUTH_PROXY_HEADER: 'Remote-User',
    APP_AUTH_TRUSTED_PROXIES: '192.0.2.0/24, 2001:db8::/32',
  });
  for (const cidrs of [
    undefined,
    '',
    '192.0.2.1',
    '192.0.2.0/33',
    '2001:db8::/129',
    'invalid/24',
    '192.0.2.0/24,',
  ]) {
    expect(() =>
      parseConfig({ ...baseEnv, APP_AUTH_MODE: 'proxy', APP_AUTH_TRUSTED_PROXIES: cidrs }),
    ).toThrow('APP_AUTH_MODE=proxy requires valid APP_AUTH_TRUSTED_PROXIES CIDRs');
  }
  expect(() =>
    parseConfig({
      ...baseEnv,
      APP_AUTH_MODE: 'proxy',
      APP_AUTH_TRUSTED_PROXIES: '192.0.2.0/24',
      APP_AUTH_PROXY_HEADER: 'invalid header',
    }),
  ).toThrow('APP_AUTH_PROXY_HEADER must be a valid HTTP header name');
});

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

it('requires both access credentials in basic mode without including secret values in errors', () => {
  for (const credentials of [
    {},
    { APP_AUTH_USERNAME: 'operator' },
    { APP_AUTH_PASSWORD: 'synthetic-private-password' },
  ]) {
    expect(() => parseConfig({ ...baseEnv, APP_AUTH_MODE: 'basic', ...credentials })).toThrow(
      'APP_AUTH_MODE=basic requires APP_AUTH_USERNAME and APP_AUTH_PASSWORD',
    );
  }
  expect(parseConfig(baseEnv).APP_AUTH_MODE).toBe('none');
  expect(
    parseConfig({
      ...baseEnv,
      APP_AUTH_MODE: 'basic',
      APP_AUTH_USERNAME: 'operator',
      APP_AUTH_PASSWORD: 'synthetic-private-password',
    }).APP_AUTH_MODE,
  ).toBe('basic');
});

it('keeps access credentials environment-owned and sensitive', () => {
  for (const key of ['APP_AUTH_USERNAME', 'APP_AUTH_PASSWORD', 'APP_API_TOKEN']) {
    expect(getConfigMetadata().find((entry) => entry.key === key)).toMatchObject({
      source: 'environment',
      sensitive: true,
      readOnly: true,
    });
    expect(() => coerceConfigBatch({ [key]: 'synthetic-value' })).toThrow(/read-only/);
  }
  expect(getConfigMetadata().find((entry) => entry.key === 'APP_AUTH_MODE')).toMatchObject({
    source: 'environment',
    default: 'none',
    readOnly: true,
  });
});

it('accepts keyless AI only with an absolute HTTP or HTTPS base URL', () => {
  for (const baseURL of ['http://localhost:11434/v1', 'https://example.test/v1']) {
    expect(
      parseConfig({ ...baseEnv, AI_ENABLED: 'true', AI_OPENAI_BASE_URL: baseURL }),
    ).toMatchObject({ AI_ENABLED: true, AI_OPENAI_BASE_URL: baseURL });
  }
  expect(() => parseConfig({ ...baseEnv, AI_ENABLED: 'true' })).toThrow(/AI_OPENAI_API_KEY/);
  expect(parseConfig(baseEnv)).not.toHaveProperty('AI_OPENAI_BASE_URL');
  for (const baseURL of ['/v1', 'example.test/v1', 'ftp://example.test', 'invalid', '']) {
    expect(() => parseConfig({ ...baseEnv, AI_OPENAI_BASE_URL: baseURL })).toThrow(
      /AI_OPENAI_BASE_URL must be an absolute http or https URL/,
    );
  }
});

it('describes the AI base URL as an environment-owned non-sensitive setting', () => {
  expect(getConfigMetadata().find((entry) => entry.key === 'AI_OPENAI_BASE_URL')).toMatchObject({
    source: 'environment',
    sensitive: false,
    readOnly: true,
  });
  expect(() => coerceConfigBatch({ AI_OPENAI_BASE_URL: 'http://localhost:11434/v1' })).toThrow(
    /read-only/,
  );
});

it('accepts AI_OPENAI_TIMEOUT_MS as a positive integer and rejects anything else', () => {
  expect(parseConfig({ ...baseEnv, AI_OPENAI_TIMEOUT_MS: '180000' })).toMatchObject({
    AI_OPENAI_TIMEOUT_MS: 180000,
  });
  expect(parseConfig(baseEnv)).not.toHaveProperty('AI_OPENAI_TIMEOUT_MS');
  for (const value of ['0', '-5', '1.5', 'abc', '', '10s']) {
    expect(() => parseConfig({ ...baseEnv, AI_OPENAI_TIMEOUT_MS: value })).toThrow(
      /AI_OPENAI_TIMEOUT_MS must be a positive integer/,
    );
  }
  expect(getConfigMetadata().find((entry) => entry.key === 'AI_OPENAI_TIMEOUT_MS')).toMatchObject({
    source: 'environment',
    sensitive: false,
    readOnly: true,
  });
});
