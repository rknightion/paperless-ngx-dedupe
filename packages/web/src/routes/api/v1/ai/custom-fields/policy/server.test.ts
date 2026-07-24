import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PolicyError extends Error {
    constructor(
      readonly code: string,
      readonly fieldId?: number,
    ) {
      super('private upstream detail');
    }
  }
  class PaperlessApiError extends Error {}
  class PaperlessConnectionError extends Error {}
  return {
    PolicyError,
    PaperlessApiError,
    PaperlessConnectionError,
    getCustomFieldPolicy: vi.fn(),
    getAiConfig: vi.fn(),
    getCustomFields: vi.fn(),
    replaceCustomFieldPolicy: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core', () => ({
  CustomFieldPolicyError: mocks.PolicyError,
  PaperlessApiError: mocks.PaperlessApiError,
  PaperlessConnectionError: mocks.PaperlessConnectionError,
  getCustomFieldPolicy: mocks.getCustomFieldPolicy,
  getAiConfig: mocks.getAiConfig,
  replaceCustomFieldPolicy: mocks.replaceCustomFieldPolicy,
  PaperlessClient: class {
    getCustomFields = mocks.getCustomFields;
  },
  toPaperlessConfig: vi.fn(() => ({})),
  safeMessageForCode: (code: string) => code,
  sanitizeCorrelationId: () => undefined,
  sanitizeValidationIssues: (issues: unknown) => issues,
}));

import { GET, PUT } from './+server';

const locals = {
  config: { AI_ENABLED: true },
  db: {},
};

function request(body: string): Request {
  return new Request('http://localhost/api/v1/ai/custom-fields/policy', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('custom-field policy API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomFieldPolicy.mockReturnValue([
      { fieldId: 2, fieldName: 'Due date', dataType: 'date', guidance: null },
    ]);
    mocks.getAiConfig.mockReturnValue({ extractCustomFields: false });
    mocks.getCustomFields.mockResolvedValue([
      {
        id: 9,
        name: 'Amount',
        dataType: 'monetary',
        extraData: { selectOptions: [], defaultCurrency: 'GBP' },
        documentCount: 12,
      },
      {
        id: 4,
        name: 'Related document',
        dataType: 'documentlink',
        extraData: { selectOptions: [] },
        documentCount: 2,
      },
      {
        id: 2,
        name: 'Due date',
        dataType: 'date',
        extraData: { selectOptions: [] },
        documentCount: 7,
      },
    ]);
    mocks.replaceCustomFieldPolicy.mockReturnValue([
      { fieldId: 9, fieldName: 'Amount', dataType: 'monetary', guidance: 'Final amount only' },
    ]);
  });

  it('returns live supported definitions and the stored server-derived snapshot', async () => {
    const response = await GET({ locals } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.policy).toEqual([
      { fieldId: 2, fieldName: 'Due date', dataType: 'date', guidance: null },
    ]);
    expect(body.data.availableFields.map(({ id }: { id: number }) => id)).toEqual([2, 9]);
    expect(JSON.stringify(body)).not.toContain('Related document');
  });

  it('replaces the policy using live Paperless definitions', async () => {
    const response = await PUT({
      locals,
      request: request(JSON.stringify({ fields: [{ fieldId: 9, guidance: 'Final amount only' }] })),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.replaceCustomFieldPolicy).toHaveBeenCalledWith(
      locals.db,
      [{ fieldId: 9, guidance: 'Final amount only' }],
      expect.arrayContaining([expect.objectContaining({ id: 9, name: 'Amount' })]),
    );
  });

  it('rejects duplicate JSON names before fetching or mutation', async () => {
    const response = await PUT({
      locals,
      request: request('{"fields":[],"fields":[{"fieldId":9}]}'),
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.getCustomFields).not.toHaveBeenCalled();
    expect(mocks.replaceCustomFieldPolicy).not.toHaveBeenCalled();
  });

  it('returns a typed safe validation error for rejected policy changes', async () => {
    mocks.replaceCustomFieldPolicy.mockImplementation(() => {
      throw new mocks.PolicyError('unknown_field', 99);
    });

    const response = await PUT({
      locals,
      request: request(JSON.stringify({ fields: [{ fieldId: 99 }] })),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.validationIssues).toEqual([
      { path: ['fields', 99], message: 'unknown_field' },
    ]);
    expect(JSON.stringify(body)).not.toContain('private upstream detail');
  });

  it('relies on the transactional invariant after delayed Paperless resolution', async () => {
    let release!: (value: unknown[]) => void;
    mocks.getCustomFields.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    mocks.replaceCustomFieldPolicy.mockImplementation(() => {
      throw new mocks.PolicyError('empty_policy');
    });

    const pending = PUT({
      locals,
      request: request(JSON.stringify({ fields: [] })),
    } as never);
    await Promise.resolve();
    release([]);
    const response = await pending;
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.validationIssues).toEqual([
      { path: ['fields', 'policy'], message: 'empty_policy' },
    ]);
    expect(mocks.replaceCustomFieldPolicy).toHaveBeenCalledWith(locals.db, [], []);
  });

  it.each([
    ['GET', () => GET({ locals } as never)],
    [
      'PUT',
      () =>
        PUT({
          locals,
          request: request(JSON.stringify({ fields: [{ fieldId: 9 }] })),
        } as never),
    ],
  ])('maps Paperless failures to sanitized 502 for %s', async (_method, invoke) => {
    mocks.getCustomFields.mockRejectedValue(new mocks.PaperlessConnectionError('private upstream'));
    const response = await invoke();
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('private upstream');
  });

  it.each([
    [
      'GET',
      () => GET({ locals } as never),
      () =>
        mocks.getCustomFieldPolicy.mockImplementation(() => {
          throw new Error('private db');
        }),
    ],
    [
      'PUT',
      () =>
        PUT({
          locals,
          request: request(JSON.stringify({ fields: [{ fieldId: 9 }] })),
        } as never),
      () =>
        mocks.replaceCustomFieldPolicy.mockImplementation(() => {
          throw new Error('private db');
        }),
    ],
  ])('maps unexpected database failures to sanitized 500 for %s', async (_method, invoke, fail) => {
    fail();
    const response = await invoke();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('private db');
  });
});
