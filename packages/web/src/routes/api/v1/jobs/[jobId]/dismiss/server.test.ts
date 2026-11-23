import { beforeEach, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({ getJob: vi.fn(), dismissDeadLetterJob: vi.fn() }));

vi.mock('@paperless-dedupe/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  getJob: mocks.getJob,
  dismissDeadLetterJob: mocks.dismissDeadLetterJob,
}));

import { POST } from './+server';

const dismiss = () => POST({ params: { jobId: 'job-1' }, locals: { db: {} } } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getJob.mockReturnValue({ id: 'job-1', type: 'analysis', status: 'failed' });
  mocks.dismissDeadLetterJob.mockReturnValue(true);
});

it('dismisses a dead-letter job', async () => {
  const response = await dismiss();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ data: { jobId: 'job-1', dismissed: true } });
});

it('reports a missing job', async () => {
  mocks.getJob.mockReturnValue(undefined);
  expect((await dismiss()).status).toBe(404);
});

it('reports a job that is not a dead letter', async () => {
  mocks.dismissDeadLetterJob.mockReturnValue(false);
  expect((await dismiss()).status).toBe(409);
});
