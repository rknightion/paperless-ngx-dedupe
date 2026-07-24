import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accepting: true,
  getServerRuntime: vi.fn(),
  createJob: vi.fn(() => 'job-batch-apply'),
  launchWorker: vi.fn(),
  RuntimeUnavailableError: class RuntimeUnavailableError extends Error {},
}));

vi.mock('../../../../../../runtime.server', () => ({
  getServerRuntime: mocks.getServerRuntime,
}));

vi.mock('$lib/server/job-dispatcher', () => ({
  resolveServerWorkerPath: vi.fn(() => '/workers/ai-apply-worker.js'),
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: {
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    BAD_REQUEST: 'BAD_REQUEST',
    JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  },
  apiSuccess: (data: unknown, _meta: unknown, status = 200) => Response.json({ data }, { status }),
  apiError: (code: string, details: Record<string, unknown>, status = 400) =>
    Response.json({ error: { code, ...details } }, { status }),
}));

vi.mock('$lib/server/scheduler', () => ({
  RuntimeUnavailableError: mocks.RuntimeUnavailableError,
}));

vi.mock('@paperless-dedupe/core', () => ({
  createJob: mocks.createJob,
  launchWorker: mocks.launchWorker,
  JobAlreadyRunningError: class JobAlreadyRunningError extends Error {},
  JobType: { AI_APPLY: 'ai_apply' },
}));

import { POST } from './+server';

describe('AI batch-apply shutdown admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accepting = true;
    mocks.getServerRuntime.mockResolvedValue({
      acceptingGate: {
        assertAccepting() {
          if (!mocks.accepting) throw new mocks.RuntimeUnavailableError();
        },
        run<T>(operation: () => T): T {
          if (!mocks.accepting) throw new mocks.RuntimeUnavailableError();
          return operation();
        },
      },
    });
  });

  it('rejects at entry without reading the request after shutdown', async () => {
    mocks.accepting = false;
    const json = vi.fn();

    const response = await POST({
      request: { json },
      locals: {
        db: {},
        config: {
          AI_ENABLED: true,
          DATABASE_URL: '/data/app.db',
        },
      },
    } as never);

    expect(response.status).toBe(503);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.launchWorker).not.toHaveBeenCalled();
  });

  it('creates no job or worker when shutdown begins while reading JSON', async () => {
    const request = {
      async json() {
        mocks.accepting = false;
        return { resultIds: ['result-1'] };
      },
    };

    const response = await POST({
      request,
      locals: {
        db: {},
        config: {
          AI_ENABLED: true,
          DATABASE_URL: '/data/app.db',
        },
      },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.launchWorker).not.toHaveBeenCalled();
  });
});
