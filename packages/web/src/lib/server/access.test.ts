import { expect, it } from 'vitest';
import { parseConfig } from '@paperless-dedupe/core';
import { decideAccess } from './access';

const environment = {
  PAPERLESS_URL: 'https://paperless.example.test',
  PAPERLESS_API_TOKEN: 'synthetic-paperless-token',
  APP_AUTH_MODE: 'basic',
  APP_AUTH_USERNAME: 'operator',
  APP_AUTH_PASSWORD: 'synthetic-password',
  APP_API_TOKEN: 'synthetic-app-token',
};

it('denies missing Basic credentials without exposing configuration values', () => {
  expect(
    decideAccess(parseConfig(environment), 'GET', '/api/v1/config', new Headers(), '127.0.0.1'),
  ).toEqual({ allowed: false, reason: 'credentials_required' });
});

it('accepts an API bearer token in either mode and refuses wrong or malformed bearer credentials', () => {
  for (const mode of ['none', 'basic']) {
    const config = parseConfig({ ...environment, APP_AUTH_MODE: mode });
    expect(
      decideAccess(
        config,
        'GET',
        '/api/v1/config',
        new Headers({ Authorization: 'Bearer synthetic-app-token' }),
        '',
      ),
    ).toEqual({ allowed: true });
    for (const authorization of [
      'Bearer incorrect',
      'Bearer',
      'Bearer synthetic-app-token extra',
    ]) {
      expect(
        decideAccess(
          config,
          'GET',
          '/api/v1/config',
          new Headers({ Authorization: authorization }),
          '',
        ),
      ).toEqual({ allowed: false, reason: 'invalid_credentials' });
    }
  }
});

it('accepts exact Basic credentials including colons in the password and refuses invalid credentials', () => {
  const config = parseConfig({ ...environment, APP_AUTH_PASSWORD: 'synthetic:password' });
  const header = (value: string) =>
    new Headers({ Authorization: `Basic ${Buffer.from(value).toString('base64')}` });
  expect(decideAccess(config, 'GET', '/', header('operator:synthetic:password'), '')).toEqual({
    allowed: true,
  });
  for (const value of ['other:synthetic:password', 'operator:incorrect', 'operator', '']) {
    expect(decideAccess(config, 'GET', '/', header(value), '').allowed).toBe(false);
  }
  expect(
    decideAccess(config, 'GET', '/', new Headers({ Authorization: 'Basic !!!' }), '').allowed,
  ).toBe(false);
});

it('preserves unauthenticated requests and upstream authorization when the mode and app token are unset', () => {
  const config = parseConfig({
    PAPERLESS_URL: environment.PAPERLESS_URL,
    PAPERLESS_API_TOKEN: environment.PAPERLESS_API_TOKEN,
  });
  for (const path of [
    '/',
    '/api/v1/config',
    '/api/v1/metrics',
    '/api/v1/paperless/documents/1/preview',
  ]) {
    for (const headers of [
      new Headers(),
      new Headers({ Authorization: 'Bearer upstream-token' }),
    ]) {
      expect(decideAccess(config, 'POST', path, headers, '').allowed).toBe(true);
    }
  }
});

it('exempts only GET health and readiness and OPTIONS while keeping metrics protected', () => {
  const config = parseConfig(environment);
  for (const path of ['/api/v1/health', '/api/v1/ready']) {
    expect(decideAccess(config, 'GET', path, new Headers(), '').allowed).toBe(true);
    expect(decideAccess(config, 'POST', path, new Headers(), '').allowed).toBe(false);
    expect(decideAccess(config, 'GET', `${path}/extra`, new Headers(), '').allowed).toBe(false);
  }
  expect(decideAccess(config, 'OPTIONS', '/api/v1/config', new Headers(), '').allowed).toBe(true);
  expect(decideAccess(config, 'GET', '/api/v1/metrics', new Headers(), '').allowed).toBe(false);
});

it('limits bearer access to API routes when Basic protection is enabled', () => {
  expect(
    decideAccess(
      parseConfig(environment),
      'GET',
      '/',
      new Headers({ Authorization: 'Bearer synthetic-app-token' }),
      '',
    ).allowed,
  ).toBe(false);
});
