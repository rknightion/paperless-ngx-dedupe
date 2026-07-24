import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, getJob: mocks.getJob };
});

import { GET } from './+server';

describe('single job API', () => {
  beforeEach(() => {
    mocks.getJob.mockReset();
  });

  it('strips the internal public history key from the exact legacy response', async () => {
    mocks.getJob.mockReturnValue({
      id: 'legacy-job',
      type: 'sync',
      status: 'completed',
      publicHistoryKey: 'PRIVATE_INTERNAL_KEY',
    });

    const response = await GET({
      params: { jobId: 'legacy-job' },
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'legacy-job', type: 'sync', status: 'completed' },
    });
  });
});
