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
