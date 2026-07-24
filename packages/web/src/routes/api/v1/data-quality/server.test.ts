import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDataQualityInsights: vi.fn(),
}));

vi.mock('@paperless-dedupe/core/queries/data-quality', () => ({
  getDataQualityInsights: mocks.getDataQualityInsights,
}));

import { GET } from './+server';

describe('data-quality API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDataQualityInsights.mockReturnValue({
      totalDocuments: 2,
      insights: [
        {
          kind: 'ocr-gap',
          count: 1,
          label: 'missing ocr',
          url: '/documents?library=true&missingOcr=true',
        },
      ],
    });
  });

  it('returns the bounded core projection without exposing request or configuration data', async () => {
    const response = await GET({
      locals: {
        db: { private: 'database detail' },
        config: { PAPERLESS_API_TOKEN: 'private-token' },
      },
      url: new URL('http://localhost/api/v1/data-quality?text=private-search'),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mocks.getDataQualityInsights).toHaveBeenCalledOnce();
    expect(mocks.getDataQualityInsights).toHaveBeenCalledWith({ private: 'database detail' });
    const body = await response.json();
    expect(body).toEqual({
      data: {
        totalDocuments: 2,
        insights: [
          {
            kind: 'ocr-gap',
            count: 1,
            label: 'missing ocr',
            url: '/documents?library=true&missingOcr=true',
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/private-search|private-token|database detail/);
  });

  it('returns a safe failure envelope when the database query fails', async () => {
    mocks.getDataQualityInsights.mockImplementation(() => {
      throw new Error('SQLite failed at /private/library.db with OCR-secret');
    });

    const response = await GET({
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        operation: 'get_data_quality_insights',
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/SQLite|private|OCR-secret/);
  });
});
