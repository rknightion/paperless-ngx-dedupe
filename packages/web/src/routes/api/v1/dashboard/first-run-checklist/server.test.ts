import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class ConfigValidationError extends Error {
    key = 'ui.firstRunChecklistDismissed';
    reason = 'invalid_value';
  }
  return {
    ConfigValidationError,
    getFirstRunChecklistDismissed: vi.fn(),
    setFirstRunChecklistDismissed: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core', () => ({
  getFirstRunChecklistDismissed: mocks.getFirstRunChecklistDismissed,
  setFirstRunChecklistDismissed: mocks.setFirstRunChecklistDismissed,
}));

vi.mock('@paperless-dedupe/core/config/registry', () => ({
  ConfigValidationError: mocks.ConfigValidationError,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { VALIDATION_FAILED: 'VALIDATION_FAILED' },
  apiSuccess: (data: unknown, meta?: unknown, status = 200) =>
    Response.json({ data, ...(meta ? { meta } : {}) }, { status }),
  apiError: (code: string, _context?: unknown, status = 400) =>
    Response.json({ error: { code } }, { status }),
}));

import { GET, PUT } from './+server';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/dashboard/first-run-checklist', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const locals = { db: { marker: 'db' }, config: { PAPERLESS_READ_ONLY: false } };

describe('first-run checklist dismissal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the stored dismissal through core', async () => {
    mocks.getFirstRunChecklistDismissed.mockReturnValue(true);

    const response = await GET({ locals } as never);

    expect(await response.json()).toEqual({ data: { dismissed: true } });
    expect(mocks.getFirstRunChecklistDismissed).toHaveBeenCalledWith(locals.db);
  });

  it('persists a dismissal through the same core store the page reads', async () => {
    mocks.setFirstRunChecklistDismissed.mockReturnValue(true);

    const response = await PUT({ request: jsonRequest({ dismissed: true }), locals } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { dismissed: true } });
    expect(mocks.setFirstRunChecklistDismissed).toHaveBeenCalledWith(locals.db, true);
  });

  it('still writes when the instance is in Paperless read-only mode, like the config route', async () => {
    mocks.setFirstRunChecklistDismissed.mockReturnValue(true);

    const response = await PUT({
      request: jsonRequest({ dismissed: true }),
      locals: { ...locals, config: { PAPERLESS_READ_ONLY: true } },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.setFirstRunChecklistDismissed).toHaveBeenCalledOnce();
  });

  it.each([
    ['malformed JSON', '{'],
    ['a missing field', {}],
    ['a non-boolean value', { dismissed: 'yes' }],
    ['an extra field', { dismissed: true, extra: 1 }],
    ['duplicate keys', '{"dismissed":false,"dismissed":true}'],
  ])('rejects %s without writing', async (_name, body) => {
    const response = await PUT({ request: jsonRequest(body), locals } as never);

    expect(response.status).toBe(400);
    expect(mocks.setFirstRunChecklistDismissed).not.toHaveBeenCalled();
  });

  it('turns a registry validation failure into a validation error', async () => {
    mocks.setFirstRunChecklistDismissed.mockImplementation(() => {
      throw new mocks.ConfigValidationError('invalid');
    });

    const response = await PUT({ request: jsonRequest({ dismissed: true }), locals } as never);

    expect(response.status).toBe(400);
  });
});
