import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createJob: vi.fn((_: unknown, type: string) => `job-${type}`),
  dispatchPending: vi.fn(),
  getServerRuntime: vi.fn(),
}));

vi.mock('../../../../../../../runtime.server', () => ({
  getServerRuntime: mocks.getServerRuntime,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: {
    BAD_REQUEST: 'BAD_REQUEST',
    JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  },
  apiSuccess: (data: unknown, _meta: unknown, status = 200) => Response.json({ data }, { status }),
  apiError: (code: string, details: unknown, status = 400) =>
    Response.json({ error: { code, details } }, { status }),
}));

vi.mock('$lib/server/scheduler', () => ({
  RuntimeUnavailableError: class RuntimeUnavailableError extends Error {},
}));

vi.mock('@paperless-dedupe/core', () => ({
  createJob: mocks.createJob,
  JobAlreadyRunningError: class JobAlreadyRunningError extends Error {},
  JobType: { AI_APPLY: 'ai_apply', AI_REVERT: 'ai_revert' },
}));

import { POST as apply } from './+server';
import { POST as revert } from '../revert/+server';

describe('single-result AI reviewed dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerRuntime.mockResolvedValue({
      acceptingGate: {
        assertAccepting: vi.fn(),
        run: <T>(operation: () => T) => operation(),
      },
      dispatchPending: mocks.dispatchPending,
    });
  });

  it.each([
    ['apply', apply, 'ai_apply'],
    ['revert', revert, 'ai_revert'],
  ])('persists and dispatches only the opaque token for %s', async (_name, handler, type) => {
    const response = await handler({
      request: {
        json: async () => ({
          planToken: 'reviewed-token-long-enough',
          resultIds: ['must-not-cross-boundary'],
          selection: { title: true },
        }),
      },
      locals: {
        db: {},
        config: { AI_ENABLED: true, DATABASE_URL: '/data/app.db' },
      },
    } as never);

    expect(response.status).toBe(202);
    expect(mocks.createJob).toHaveBeenCalledWith({}, type, {
      planToken: 'reviewed-token-long-enough',
    });
    expect(mocks.dispatchPending).toHaveBeenCalledOnce();
  });
});
