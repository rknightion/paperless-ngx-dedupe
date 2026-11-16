import { expect, it } from 'vitest';
import { toPaperlessConfig, paperlessConfigSchema } from '../paperless/schemas.js';
import { parseConfig } from '../config.js';

it('keeps Paperless writable by default and enables the environment-owned read-only flag', () => {
  const environment = {
    PAPERLESS_URL: 'https://paperless.example.test',
    PAPERLESS_API_TOKEN: 'synthetic-token',
  };
  expect(parseConfig(environment).PAPERLESS_READ_ONLY).toBe(false);
  expect(parseConfig({ ...environment, PAPERLESS_READ_ONLY: 'true' }).PAPERLESS_READ_ONLY).toBe(
    true,
  );
  expect(parseConfig({ ...environment, PAPERLESS_READ_ONLY: 'false' }).PAPERLESS_READ_ONLY).toBe(
    false,
  );
});

it('passes read-only configuration through the app bridge and client schema', () => {
  const app = parseConfig({
    PAPERLESS_URL: 'https://paperless.example.test',
    PAPERLESS_API_TOKEN: 'synthetic-token',
    PAPERLESS_READ_ONLY: 'true',
  });
  expect(paperlessConfigSchema.parse(toPaperlessConfig(app)).readOnly).toBe(true);
});
