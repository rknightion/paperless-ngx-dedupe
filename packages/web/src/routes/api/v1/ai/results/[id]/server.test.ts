import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getAiResult: vi.fn(),
  getAiInboxResult: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, ...mocks };
});

import { GET } from './+server';

describe('AI result detail modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiResult.mockReturnValue({ id: 'result-1', rawResponseJson: 'legacy-raw' });
    mocks.getAiInboxResult.mockReturnValue({ id: 'result-1', evidence: 'safe' });
  });

  it('preserves the exact legacy detail response by default', async () => {
    const response = await GET({
      params: { id: 'result-1' },
      url: new URL('http://localhost/api/v1/ai/results/result-1'),
      locals: { db: {} },
    } as never);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'result-1', rawResponseJson: 'legacy-raw' },
    });
    expect(mocks.getAiInboxResult).not.toHaveBeenCalled();
  });

  it('uses the safe projection only when inbox mode is explicit', async () => {
    const response = await GET({
      params: { id: 'result-1' },
      url: new URL('http://localhost/api/v1/ai/results/result-1?mode=inbox'),
      locals: { db: {} },
    } as never);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'result-1', evidence: 'safe' },
    });
    expect(mocks.getAiResult).not.toHaveBeenCalled();
  });

  it('adds signed media links only when media is requested', async () => {
    mocks.getAiInboxResult.mockReturnValue({ id: 'result-1', paperlessId: 7 });
    const response = await GET({
      params: { id: 'result-1' },
      url: new URL('http://localhost/api/v1/ai/results/result-1?mode=inbox&includeMedia=true'),
      locals: { db: {} },
    } as never);
    const { data } = await response.json();
    expect(data.thumbnailUrl).toMatch(/\/documents\/7\/thumb\?access=\d+\.[\w-]+$/);
    expect(data.previewUrl).toMatch(/\/documents\/7\/preview\?access=\d+\.[\w-]+$/);
  });
});
