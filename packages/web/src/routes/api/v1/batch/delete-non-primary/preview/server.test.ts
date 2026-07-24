import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDuplicateDeletionPlan: vi.fn(() => ({
    token: 'opaque-reviewed-plan-token-00000000000001',
    expiresAt: '2026-07-24T12:15:00.000Z',
    groups: [
      {
        groupId: 'group-1',
        updatedAt: '2026-07-24T11:00:00.000Z',
        primaryDocumentId: 'document-primary',
        primaryPaperlessId: 101,
        nonPrimaryDocuments: [{ documentId: 'document-duplicate', paperlessId: 202 }],
      },
    ],
  })),
  getServerRuntime: vi.fn(),
  RuntimeUnavailableError: class RuntimeUnavailableError extends Error {},
  DuplicateDeletionPreviewError: class DuplicateDeletionPreviewError extends Error {},
}));

vi.mock('../../../../../../runtime.server', () => ({
  getServerRuntime: mocks.getServerRuntime,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: {
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
  },
  apiSuccess: (data: unknown, _meta: unknown, status = 200) => Response.json({ data }, { status }),
  apiError: (code: string, details: Record<string, unknown>, status = 400) =>
    Response.json({ error: { code, ...details } }, { status }),
}));

vi.mock('$lib/server/scheduler', () => ({
  RuntimeUnavailableError: mocks.RuntimeUnavailableError,
}));

vi.mock('@paperless-dedupe/core', () => ({
  createDuplicateDeletionPlan: mocks.createDuplicateDeletionPlan,
  DuplicateDeletionPreviewError: mocks.DuplicateDeletionPreviewError,
}));

import { POST } from './+server';

describe('duplicate deletion preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerRuntime.mockResolvedValue({
      acceptingGate: {
        assertAccepting: vi.fn(),
        run<T>(operation: () => T): T {
          return operation();
        },
      },
    });
  });

  it('returns an opaque plan and the exact frozen reviewed selection', async () => {
    const db = {};
    const response = await POST({
      request: {
        json: vi.fn().mockResolvedValue({ groupIds: ['group-1'] }),
      },
      locals: { db },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.createDuplicateDeletionPlan).toHaveBeenCalledWith(db, ['group-1']);
    await expect(response.json()).resolves.toEqual({
      data: {
        planToken: 'opaque-reviewed-plan-token-00000000000001',
        expiresAt: '2026-07-24T12:15:00.000Z',
        groupCount: 1,
        documentCount: 1,
        groups: [
          {
            groupId: 'group-1',
            updatedAt: '2026-07-24T11:00:00.000Z',
            primaryDocumentId: 'document-primary',
            primaryPaperlessId: 101,
            nonPrimaryDocuments: [{ documentId: 'document-duplicate', paperlessId: 202 }],
          },
        ],
      },
    });
  });
});
