import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class ConfigValidationError extends Error {}
  return {
    ConfigValidationError,
    importConfig: vi.fn(),
    previewConfigImport: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core/export/config', () => ({
  importConfig: mocks.importConfig,
  previewConfigImport: mocks.previewConfigImport,
}));

vi.mock('@paperless-dedupe/core/config/registry', () => ({
  ConfigValidationError: mocks.ConfigValidationError,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { VALIDATION_FAILED: 'VALIDATION_FAILED' },
  apiSuccess: (data: unknown, meta?: unknown, status = 200) =>
    Response.json({ data, ...(meta ? { meta } : {}) }, { status }),
  apiError: (code: string, _context?: unknown, status = 400) =>
    Response.json({ error: { code, retryable: false } }, { status }),
}));

import { POST } from './+server';

const backup = {
  version: '1.0',
  exportedAt: '2026-07-24T00:00:00.000Z',
  appConfig: { 'ai.autoProcess': 'true' },
  dedupConfig: {},
};

describe('config import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewConfigImport.mockReturnValue({
      appConfig: {},
      deprecatedKeys: [{ key: 'ai.autoProcess' }],
      droppedKeys: [],
      scheduledAiOptIn: { requested: true, requiresConfirmation: true },
    });
    mocks.importConfig.mockReturnValue({
      appConfigKeys: 0,
      dedupConfigUpdated: true,
      scheduledAiOptIn: {
        requested: true,
        applied: false,
        reason: 'confirmation_required',
      },
    });
  });

  it('previews deprecated and dropped keys without mutating configuration', async () => {
    const response = await POST({
      request: { text: vi.fn().mockResolvedValue(JSON.stringify({ mode: 'preview', backup })) },
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.previewConfigImport).toHaveBeenCalledWith(backup);
    expect(mocks.importConfig).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      data: {
        scheduledAiOptIn: { requested: true, requiresConfirmation: true },
      },
    });
  });

  it('passes the explicit scheduled-AI confirmation only from the apply wrapper', async () => {
    await POST({
      request: {
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            mode: 'apply',
            backup,
            confirmScheduledAiOptIn: true,
          }),
        ),
      },
      locals: { db: {} },
    } as never);

    expect(mocks.importConfig).toHaveBeenCalledWith({}, backup, { confirmScheduledAiOptIn: true });
  });

  it('keeps raw v1 backup uploads compatible and never infers confirmation', async () => {
    await POST({
      request: { text: vi.fn().mockResolvedValue(JSON.stringify(backup)) },
      locals: { db: {} },
    } as never);

    expect(mocks.importConfig).toHaveBeenCalledWith({}, backup, {
      confirmScheduledAiOptIn: false,
    });
  });

  it('returns a safe validation failure for registry errors', async () => {
    mocks.previewConfigImport.mockImplementation(() => {
      throw new mocks.ConfigValidationError('private value must not be returned');
    });
    const response = await POST({
      request: { text: vi.fn().mockResolvedValue(JSON.stringify({ mode: 'preview', backup })) },
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private value must not be returned');
  });

  it('rejects duplicate JSON property names before import parsing', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/v1/import/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{
          "version":"1.0",
          "exportedAt":"2026-07-24T00:00:00.000Z",
          "appConfig":{"ai.model":"gpt-5.4-mini","ai.model":"gpt-5.4"},
          "dedupConfig":{}
        }`,
      }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.importConfig).not.toHaveBeenCalled();
    expect(mocks.previewConfigImport).not.toHaveBeenCalled();
  });

  it.each([
    [
      'escaped-equivalent application keys',
      `{
        "version":"1.0",
        "exportedAt":"2026-07-24T00:00:00.000Z",
        "appConfig":{"ai.model":"gpt-5.4-mini","ai\\u002emodel":"gpt-5.4"},
        "dedupConfig":{}
      }`,
    ],
    [
      'nested deduplication keys',
      `{
        "version":"1.0",
        "exportedAt":"2026-07-24T00:00:00.000Z",
        "appConfig":{},
        "dedupConfig":{"minWords":10,"minWords":20}
      }`,
    ],
  ])('rejects duplicate %s before import parsing', async (_description, body) => {
    const response = await POST({
      request: new Request('http://localhost/api/v1/import/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.importConfig).not.toHaveBeenCalled();
    expect(mocks.previewConfigImport).not.toHaveBeenCalled();
  });
});
