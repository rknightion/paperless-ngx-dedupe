import { beforeEach, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({ createAiApplyPlan: vi.fn() }));

vi.mock('@paperless-dedupe/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  createAiApplyPlan: mocks.createAiApplyPlan,
  getAiConfig: () => ({ processedTagName: 'ai-processed' }),
  PaperlessClient: class PaperlessClient {},
  toPaperlessConfig: () => ({}),
}));

import { POST } from './+server';

const selection = {
  title: true,
  correspondent: false,
  documentType: false,
  tags: false,
  processedTag: false,
  customFieldIds: [],
};

function preflight(scope: unknown, bulkEnabled: boolean) {
  return POST({
    request: new Request('http://localhost/api/v1/ai/results/preflight', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope, selection }),
    }),
    locals: { db: {}, config: { AI_ENABLED: true, AI_BULK_ALL_ENABLED: bulkEnabled } },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAiApplyPlan.mockResolvedValue({ token: 'synthetic-plan-token' });
});

it.each([
  { type: 'all_pending' },
  { type: 'current_filter', filters: {} },
  { type: 'current_filter', filters: { search: 'invoice' } },
])('creates no plan for bulk scope %j unless bulk actions are enabled', async (scope) => {
  const refused = await preflight(scope, false);
  expect(refused.status).toBe(401);
  expect(mocks.createAiApplyPlan).not.toHaveBeenCalled();
  expect((await preflight(scope, true)).status).toBe(200);
  expect(mocks.createAiApplyPlan).toHaveBeenCalledTimes(1);
});

it('plans an explicit selection whether or not bulk actions are enabled', async () => {
  const scope = { type: 'selected_result_ids', resultIds: ['result-1'] };
  expect((await preflight(scope, false)).status).toBe(200);
  expect((await preflight(scope, true)).status).toBe(200);
});

it.each([
  { type: 'unknown' },
  { type: 'selected_result_ids' },
  { type: 'selected_result_ids', resultIds: [] },
  { type: 'current_filter', filters: [] },
])('rejects malformed scope %j', async (scope) => {
  expect((await preflight(scope, true)).status).toBe(400);
  expect(mocks.createAiApplyPlan).not.toHaveBeenCalled();
});
