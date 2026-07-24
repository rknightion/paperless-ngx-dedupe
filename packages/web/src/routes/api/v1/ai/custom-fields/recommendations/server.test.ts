import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class OperationConflictError extends Error {}
  class RuntimeUnavailableError extends Error {}
  return {
    OperationConflictError,
    RuntimeUnavailableError,
    dispatchPending: vi.fn(),
    enqueueManual: vi.fn(),
    getLatest: vi.fn(),
    getCustomFields: vi.fn(),
  };
});

vi.mock('@paperless-dedupe/core', () => ({
  JobType: { CUSTOM_FIELD_DISCOVERY: 'custom_field_discovery' },
  OperationConflictError: mocks.OperationConflictError,
  getLatestCustomFieldDiscoveryRun: mocks.getLatest,
  PaperlessClient: class {
    getCustomFields = mocks.getCustomFields;
  },
  toPaperlessConfig: vi.fn(() => ({})),
  safeMessageForCode: (code: string) => code,
  sanitizeCorrelationId: () => undefined,
  sanitizeValidationIssues: (issues: unknown) => issues,
}));

vi.mock('../../../../../../runtime.server', () => ({
  getServerRuntime: vi.fn(async () => ({
    enqueueManual: mocks.enqueueManual,
    dispatchPending: mocks.dispatchPending,
  })),
}));

vi.mock('$lib/server/scheduler', () => ({
  RuntimeUnavailableError: mocks.RuntimeUnavailableError,
}));

import { GET, POST } from './+server';

const locals = {
  config: { AI_ENABLED: false },
  db: {},
};

describe('custom-field discovery recommendations API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomFields.mockResolvedValue([
      { id: 1, name: 'Existing Field', dataType: 'string' },
      { id: 2, name: 'Another Field', dataType: 'date' },
    ]);
    mocks.enqueueManual.mockReturnValue({ jobId: 'job-discovery' });
    mocks.dispatchPending.mockResolvedValue(undefined);
    mocks.getLatest.mockReturnValue(null);
  });

  it('enqueues manual discovery even when AI processing is disabled', async () => {
    const response = await POST({ locals } as never);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: { jobId: 'job-discovery', existingFieldsUnavailable: false },
    });
    expect(mocks.enqueueManual).toHaveBeenCalledWith(
      'custom_field_discovery',
      'custom_field_discovery',
      { existingFieldNames: ['Another Field', 'Existing Field'] },
    );
    expect(mocks.dispatchPending).toHaveBeenCalledOnce();
  });

  it('still enqueues safely when Paperless field lookup is unavailable', async () => {
    mocks.getCustomFields.mockRejectedValue(new Error('private upstream URL and token'));

    const response = await POST({ locals } as never);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.data).toEqual({
      jobId: 'job-discovery',
      existingFieldsUnavailable: true,
    });
    expect(JSON.stringify(body)).not.toContain('private upstream');
    expect(mocks.enqueueManual).toHaveBeenCalledWith(
      'custom_field_discovery',
      'custom_field_discovery',
      { existingFieldNames: [] },
    );
  });

  it('returns the latest aggregate-only durable run', async () => {
    mocks.getLatest.mockReturnValue({
      key: 'opaque-public-key',
      status: 'completed',
      createdAt: '2026-07-24T10:00:00.000Z',
      completedAt: '2026-07-24T10:01:00.000Z',
      result: { documentsScanned: 10, candidates: [] },
      error: null,
    });

    const response = await GET({ locals } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.run).toMatchObject({
      key: 'opaque-public-key',
      status: 'completed',
      result: { documentsScanned: 10, candidates: [] },
    });
    expect(JSON.stringify(body)).not.toContain('jobId');
  });

  it('maps active-run conflicts without dispatching another worker', async () => {
    mocks.enqueueManual.mockImplementation(() => {
      throw new mocks.OperationConflictError('already running');
    });

    const response = await POST({ locals } as never);

    expect(response.status).toBe(409);
    expect(mocks.dispatchPending).not.toHaveBeenCalled();
  });
});
