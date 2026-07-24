import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  setAiConfig: vi.fn(),
  validateTagAliasYaml: vi.fn(() => ({ valid: true })),
}));

vi.mock('@paperless-dedupe/core', () => ({
  aiConfigSchema: z.object({ model: z.string() }).strict(),
  getAiConfig: mocks.getAiConfig,
  setAiConfig: mocks.setAiConfig,
  validateTagAliasYaml: mocks.validateTagAliasYaml,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { BAD_REQUEST: 'BAD_REQUEST', VALIDATION_FAILED: 'VALIDATION_FAILED' },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string) => Response.json({ error: { code } }, { status: 400 }),
}));

import { PUT } from './+server';

function jsonRequest(body: string): Request {
  return new Request('http://localhost/api/v1/ai/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('AI config API JSON boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['plain', '{"model":"a","model":"b"}'],
    ['nested', '{"model":"a","metadata":{"x":1,"x":2}}'],
    ['escape-equivalent', '{"model":"a","m\\u006fdel":"b"}'],
  ])('rejects %s duplicate JSON names before mutation', async (_kind, body) => {
    const response = await PUT({
      request: jsonRequest(body),
      locals: { config: { AI_ENABLED: true }, db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.setAiConfig).not.toHaveBeenCalled();
  });
});
