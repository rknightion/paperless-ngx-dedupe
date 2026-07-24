import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  setDedupConfig: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', () => ({
  checkAnalysisStaleness: vi.fn(() => ({ isStale: false })),
  dedupConfigBaseSchema: z.object({ minWords: z.number() }).strict(),
  getDedupConfig: vi.fn(),
  recalculateConfidenceScores: vi.fn(),
  setDedupConfig: mocks.setDedupConfig,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { VALIDATION_FAILED: 'VALIDATION_FAILED' },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string) => Response.json({ error: { code } }, { status: 400 }),
}));

import { PUT } from './+server';

function jsonRequest(body: string): Request {
  return new Request('http://localhost/api/v1/config/dedup', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('dedup config API JSON boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['plain', '{"minWords":10,"minWords":20}'],
    ['nested', '{"minWords":10,"metadata":{"x":1,"x":2}}'],
    ['escape-equivalent', '{"minWords":10,"min\\u0057ords":20}'],
  ])('rejects %s duplicate JSON names before mutation', async (_kind, body) => {
    const response = await PUT({
      request: jsonRequest(body),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.setDedupConfig).not.toHaveBeenCalled();
  });
});
