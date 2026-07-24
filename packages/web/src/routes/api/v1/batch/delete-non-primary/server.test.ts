import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accepting: true,
  getServerRuntime: vi.fn(),
  createJob: vi.fn(() => 'job-delete'),
  launchWorker: vi.fn(),
  createDuplicateDeletionPlan: vi.fn(() => ({
    token: 'legacy-opaque-reviewed-plan-token-000000001',
  })),
  getReviewedMutationPlan: vi.fn(() => ({
    id: 'plan-1',
    operation: 'duplicate_delete',
    expiresAt: '2026-07-24T12:15:00.000Z',
    consumedAt: null,
  })),
  RuntimeUnavailableError: class RuntimeUnavailableError extends Error {},
  MutationPlanError: class MutationPlanError extends Error {
    constructor(public readonly reason: string) {
      super('Reviewed mutation plan is unavailable');
    }
  },
}));

vi.mock('../../../../../runtime.server', () => ({
  getServerRuntime: mocks.getServerRuntime,
}));

vi.mock('$lib/server/job-dispatcher', () => ({
  resolveServerWorkerPath: vi.fn(() => '/workers/batch-worker.js'),
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: {
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
    CONFLICT: 'CONFLICT',
  },
  apiSuccess: (data: unknown, _meta: unknown, status = 200) => Response.json({ data }, { status }),
  apiError: (code: string, details: Record<string, unknown>, status?: number) =>
    Response.json(
      { error: { code, ...details } },
      { status: status ?? (code === 'CONFLICT' ? 409 : 400) },
    ),
}));

vi.mock('$lib/server/scheduler', () => ({
  RuntimeUnavailableError: mocks.RuntimeUnavailableError,
}));

vi.mock('drizzle-orm', () => ({
  inArray: vi.fn(() => 'group-filter'),
}));

vi.mock('@paperless-dedupe/core', () => ({
  createJob: mocks.createJob,
  launchWorker: mocks.launchWorker,
  getReviewedMutationPlan: mocks.getReviewedMutationPlan,
  createDuplicateDeletionPlan: mocks.createDuplicateDeletionPlan,
  MutationPlanError: mocks.MutationPlanError,
  DuplicateDeletionPreviewError: class DuplicateDeletionPreviewError extends Error {},
  JobAlreadyRunningError: class JobAlreadyRunningError extends Error {},
  JobType: { BATCH_OPERATION: 'batch_operation' },
  duplicateGroup: { id: 'id', status: 'status' },
}));

import { POST } from './+server';

describe('delete non-primary shutdown admission', () => {
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
      locals: { db: {}, config: {} },
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
        return { groupIds: ['group-1'], confirm: true };
      },
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      }),
    };

    const response = await POST({ request, locals: { db, config: {} } } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.launchWorker).not.toHaveBeenCalled();
  });

  it('submits only the opaque reviewed-plan token to the durable job and worker', async () => {
    const response = await POST({
      request: {
        json: vi.fn().mockResolvedValue({
          planToken: 'opaque-reviewed-plan-token-00000000000001',
          confirm: true,
        }),
      },
      locals: {
        db: {},
        config: { DATABASE_URL: '/tmp/reviewed-plan.db' },
      },
    } as never);

    expect(response.status).toBe(202);
    expect(mocks.getReviewedMutationPlan).toHaveBeenCalledWith(
      {},
      'opaque-reviewed-plan-token-00000000000001',
      'duplicate_delete',
    );
    expect(mocks.createJob).toHaveBeenCalledWith({}, 'batch_operation', {
      planToken: 'opaque-reviewed-plan-token-00000000000001',
    });
    expect(mocks.launchWorker).toHaveBeenCalledWith({
      jobId: 'job-delete',
      dbPath: '/tmp/reviewed-plan.db',
      workerScriptPath: '/workers/batch-worker.js',
      taskData: { planToken: 'opaque-reviewed-plan-token-00000000000001' },
    });
  });

  it('preserves the legacy confirmed request while freezing it before dispatch', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      }),
    };
    const response = await POST({
      request: {
        json: vi.fn().mockResolvedValue({
          groupIds: ['group-1'],
          confirm: true,
        }),
      },
      locals: {
        db,
        config: { DATABASE_URL: '/tmp/reviewed-plan.db' },
      },
    } as never);

    expect(response.status).toBe(202);
    expect(mocks.createDuplicateDeletionPlan).toHaveBeenCalledWith(db, ['group-1']);
    expect(mocks.createJob).toHaveBeenCalledWith(db, 'batch_operation', {
      planToken: 'legacy-opaque-reviewed-plan-token-000000001',
    });
    expect(mocks.launchWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        taskData: { planToken: 'legacy-opaque-reviewed-plan-token-000000001' },
      }),
    );
  });

  it.each(['expired', 'consumed'])(
    'rejects an %s plan without creating work or exposing the token',
    async (reason) => {
      const planToken = `opaque-${reason}-reviewed-plan-token-000000001`;
      mocks.getReviewedMutationPlan.mockImplementationOnce(() => {
        throw new mocks.MutationPlanError(reason);
      });

      const response = await POST({
        request: {
          json: vi.fn().mockResolvedValue({ planToken, confirm: true }),
        },
        locals: {
          db: {},
          config: { DATABASE_URL: '/tmp/reviewed-plan.db' },
        },
      } as never);

      expect(response.status).toBe(409);
      expect(mocks.createJob).not.toHaveBeenCalled();
      expect(mocks.launchWorker).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain(planToken);
    },
  );
});
