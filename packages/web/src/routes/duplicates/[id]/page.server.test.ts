import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDuplicateGroupLight: vi.fn(),
  getDedupConfig: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', () => ({
  getDuplicateGroupLight: mocks.getDuplicateGroupLight,
  getDedupConfig: mocks.getDedupConfig,
}));

import { load } from './+page.server';

describe('duplicate detail page load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDuplicateGroupLight.mockReturnValue({
      id: 'group-1',
      members: [
        { documentId: 'doc-1', paperlessId: 101, isPrimary: true },
        { documentId: 'doc-2', paperlessId: 202, isPrimary: false },
      ],
    });
    mocks.getDedupConfig.mockReturnValue({
      confidenceWeightJaccard: 0.4,
      confidenceWeightFuzzy: 0.6,
      discriminativePenaltyStrength: 0.2,
    });
  });

  it('returns browser-safe signed media URLs for every duplicate member', async () => {
    const result = (await load({
      params: { id: 'group-1' },
      locals: {
        db: {},
        config: {
          PAPERLESS_URL: 'http://paperless.internal',
          PAPERLESS_API_TOKEN: 'paperless-secret',
        },
      },
    } as never)) as {
      mediaByDocumentId: Record<string, { thumbnailUrl: string; previewUrl: string }>;
    };

    expect(Object.keys(result.mediaByDocumentId)).toEqual(['doc-1', 'doc-2']);

    for (const [documentId, paperlessId] of [
      ['doc-1', 101],
      ['doc-2', 202],
    ] as const) {
      const media = result.mediaByDocumentId[documentId];
      expect(media?.thumbnailUrl).toMatch(
        new RegExp(`^/api/v1/paperless/documents/${paperlessId}/thumb\\?access=\\d+\\.[\\w-]+$`),
      );
      expect(media?.previewUrl).toMatch(
        new RegExp(`^/api/v1/paperless/documents/${paperlessId}/preview\\?access=\\d+\\.[\\w-]+$`),
      );
      expect(media?.thumbnailUrl).not.toContain('paperless-secret');
      expect(media?.previewUrl).not.toContain('paperless-secret');
    }
  });
});
