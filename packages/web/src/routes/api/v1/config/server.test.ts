import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => {
  class ConfigValidationError extends Error {}
  return {
    ConfigValidationError,
    getConfig: vi.fn(),
    getConfigMetadata: vi.fn(),
    redactSensitiveConfig: vi.fn(),
    setConfig: vi.fn(),
    setConfigBatch: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core', () => ({
  getConfig: mocks.getConfig,
  redactSensitiveConfig: mocks.redactSensitiveConfig,
  setConfig: mocks.setConfig,
  setConfigBatch: mocks.setConfigBatch,
}));

vi.mock('@paperless-dedupe/core/config/registry', () => ({
  ConfigValidationError: mocks.ConfigValidationError,
  getConfigMetadata: mocks.getConfigMetadata,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { VALIDATION_FAILED: 'VALIDATION_FAILED' },
  apiSuccess: (data: unknown, meta?: unknown, status = 200) =>
    Response.json({ data, ...(meta ? { meta } : {}) }, { status }),
  apiError: (code: string, _context?: unknown, status = 400) =>
    Response.json(
      { error: { code, retryable: false, message: 'Request validation failed' } },
      { status },
    ),
}));

import { GET, PUT } from './+server';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('typed config API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      'ai.batchSize': '50',
      PAPERLESS_API_TOKEN: 'must-not-return',
    });
    mocks.redactSensitiveConfig.mockReturnValue({ 'ai.batchSize': '50' });
    mocks.getConfigMetadata.mockReturnValue([
      {
        key: 'PAPERLESS_URL',
        type: 'string',
        sensitive: true,
        section: 'paperless',
        source: 'environment',
        readOnly: true,
      },
    ]);
  });

  it('returns compatible values with deterministic registry metadata and no secrets', async () => {
    const response = await GET({ locals: { db: {} } } as never);
    const body = await response.json();

    expect(body).toEqual({
      data: { 'ai.batchSize': '50' },
      meta: {
        registry: [
          {
            key: 'PAPERLESS_URL',
            type: 'string',
            sensitive: true,
            section: 'paperless',
            source: 'environment',
            readOnly: true,
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('must-not-return');
  });

  it('accepts typed values for a complete batch', async () => {
    const response = await PUT({
      request: jsonRequest({
        settings: { 'ai.batchSize': 50, 'ai.extractCustomFields': true },
      }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.setConfigBatch).toHaveBeenCalledWith(
      {},
      { 'ai.batchSize': 50, 'ai.extractCustomFields': true },
    );
  });

  it('returns a safe validation error for unknown or read-only keys', async () => {
    mocks.setConfigBatch.mockImplementation(() => {
      throw new mocks.ConfigValidationError('Unknown configuration key "constructor"');
    });

    const response = await PUT({
      request: jsonRequest({
        settings: Object.fromEntries([
          ['ai.model', 'gpt-5.4'],
          ['constructor', 'pollution'],
        ]),
      }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain('pollution');
  });

  it('returns a validation error for invalid cross-field configuration', async () => {
    mocks.setConfigBatch.mockImplementation(() => {
      z.object({ total: z.literal(100) }).parse({ total: 110 });
    });

    const response = await PUT({
      request: jsonRequest({
        settings: {
          'dedup.confidenceWeightJaccard': 80,
          'dedup.confidenceWeightFuzzy': 30,
        },
      }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('does not pass a malformed settings container to core', async () => {
    const response = await PUT({
      request: jsonRequest({ settings: [] }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.setConfigBatch).not.toHaveBeenCalled();
  });

  it.each([
    ['plain', '{"settings":{"ai.model":"a","ai.model":"b"}}'],
    ['nested', '{"settings":{"ai.model":"a"},"metadata":{"x":1,"x":2}}'],
    ['escape-equivalent', '{"settings":{"ai.model":"a","ai\\u002emodel":"b"}}'],
  ])('rejects %s duplicate JSON names before mutation', async (_kind, body) => {
    const response = await PUT({
      request: jsonRequest(body),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.setConfig).not.toHaveBeenCalled();
    expect(mocks.setConfigBatch).not.toHaveBeenCalled();
  });
});
