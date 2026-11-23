import { beforeEach, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  retryDeadLetterJob: vi.fn(),
  dispatchPending: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  getJob: mocks.getJob,
  retryDeadLetterJob: mocks.retryDeadLetterJob,
}));
vi.mock('../../../../../../runtime.server', () => ({
  getServerRuntime: async () => ({
    dispatchPending: mocks.dispatchPending,
    acceptingGate: {
      assertAccepting: vi.fn(),
      run: (operation: () => unknown) => operation(),
    },
  }),
}));

import { POST } from './+server';

const retry = (readOnly = false, aiEnabled = true) =>
  POST({
    params: { jobId: 'job-1' },
    locals: { db: {}, config: { PAPERLESS_READ_ONLY: readOnly, AI_ENABLED: aiEnabled } },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getJob.mockReturnValue({ id: 'job-1', type: 'analysis', status: 'failed' });
  mocks.retryDeadLetterJob.mockReturnValue(true);
});

it('requeues a dead-letter job and dispatches it', async () => {
  const response = await retry();
  expect(response.status).toBe(202);
  await expect(response.json()).resolves.toEqual({ data: { jobId: 'job-1', status: 'pending' } });
  expect(mocks.dispatchPending).toHaveBeenCalledTimes(1);
});

it('reports a missing job', async () => {
  mocks.getJob.mockReturnValue(undefined);
  expect((await retry()).status).toBe(404);
  expect(mocks.retryDeadLetterJob).not.toHaveBeenCalled();
});

it('reports a job that cannot be retried and dispatches nothing', async () => {
  mocks.retryDeadLetterJob.mockReturnValue(false);
  expect((await retry()).status).toBe(409);
  expect(mocks.dispatchPending).not.toHaveBeenCalled();
});

it.each(['batch_operation', 'duplicate_restore', 'ai_apply', 'ai_revert'])(
  'refuses to retry %s in read-only mode',
  async (type) => {
    mocks.getJob.mockReturnValue({ id: 'job-1', type, status: 'failed' });
    const response = await retry(true);
    expect((await response.json()).error.code).toBe('READ_ONLY');
    expect(mocks.retryDeadLetterJob).not.toHaveBeenCalled();
  },
);

it.each(['ai_processing', 'ai_apply', 'ai_revert', 'custom_field_discovery'])(
  'refuses to retry %s while AI is disabled',
  async (type) => {
    mocks.getJob.mockReturnValue({ id: 'job-1', type, status: 'failed' });
    expect((await retry(false, false)).status).toBe(400);
    expect(mocks.retryDeadLetterJob).not.toHaveBeenCalled();
  },
);

it('still retries a job that only reads from Paperless in read-only mode', async () => {
  expect((await retry(true)).status).toBe(202);
});
