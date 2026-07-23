import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  getAiStats: vi.fn(),
  getDashboard: vi.fn(),
  getDuplicateStats: vi.fn(),
  listJobs: vi.fn(),
  getStatistics: vi.fn(),
  PaperlessClient: vi.fn(),
  toPaperlessConfig: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', () => core);

import { load } from '../../../routes/+page.server.js';

const config = { AI_ENABLED: false };
const locals = { config, db: {} };
type LoadedOverview = { readiness: { paperless: { status: string; apiVersion: string | null } } };

describe('overview page loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    core.getDashboard.mockReturnValue({
      readiness: {
        lastSyncAt: null,
        lastAnalysisAt: null,
        analysisStale: false,
        failedJobCount: 0,
        pendingDuplicateGroups: 0,
        pendingAiResults: 0,
      },
    });
    core.getDuplicateStats.mockReturnValue({});
    core.listJobs.mockReturnValue([]);
    core.toPaperlessConfig.mockReturnValue({ url: 'http://paperless.test', token: 'test-token' });
    core.PaperlessClient.mockImplementation(function () {
      return {
        apiVersion: '10',
        getStatistics: core.getStatistics,
      };
    });
  });

  it('performs one bounded statistics request and exposes its negotiated API version', async () => {
    core.getStatistics.mockResolvedValue({});

    const result = (await load({ locals } as never)) as LoadedOverview;

    expect(core.toPaperlessConfig).toHaveBeenCalledOnce();
    expect(core.PaperlessClient).toHaveBeenCalledOnce();
    expect(core.PaperlessClient).toHaveBeenCalledWith({
      url: 'http://paperless.test',
      token: 'test-token',
      timeout: 5_000,
      maxRetries: 0,
    });
    expect(core.getStatistics).toHaveBeenCalledTimes(1);
    expect(result.readiness.paperless).toEqual({ status: 'connected', apiVersion: '10' });
  });

  it('returns unavailable when the bounded request fails', async () => {
    core.getStatistics.mockRejectedValue(new Error('offline'));

    const result = (await load({ locals } as never)) as LoadedOverview;

    expect(core.getStatistics).toHaveBeenCalledTimes(1);
    expect(result.readiness.paperless).toEqual({ status: 'unavailable', apiVersion: null });
  });

  it('returns unavailable when Paperless configuration is malformed', async () => {
    core.toPaperlessConfig.mockImplementation(() => {
      throw new Error('invalid configuration');
    });

    const result = (await load({ locals } as never)) as LoadedOverview;

    expect(core.PaperlessClient).not.toHaveBeenCalled();
    expect(result.readiness.paperless).toEqual({ status: 'unavailable', apiVersion: null });
  });
});
