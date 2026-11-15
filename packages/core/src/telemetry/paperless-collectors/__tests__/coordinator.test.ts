import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PaperlessClient } from '../../../paperless/client.js';
import { PaperlessMetricsCoordinator } from '../coordinator.js';
import { createLogger } from '../../../logger.js';
import { metrics } from '@opentelemetry/api';
import { COLLECTOR_IDS } from '../types.js';

// Mock @opentelemetry/api
vi.mock('@opentelemetry/api', () => {
  const mockGauge = {
    addCallback: vi.fn(),
  };
  const mockCounter = {
    add: vi.fn(),
  };
  const mockMeter = {
    createObservableGauge: vi.fn(() => mockGauge),
    createCounter: vi.fn(() => mockCounter),
    addBatchObservableCallback: vi.fn(),
  };
  return {
    metrics: {
      getMeter: vi.fn(() => mockMeter),
    },
  };
});

// Mock logger
vi.mock('../../../logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

function createMockClient() {
  return {
    getStatus: vi.fn().mockResolvedValue({
      pngxVersion: null,
      storageTotal: 1000,
      storageAvailable: 500,
      databaseStatus: 'OK',
      databaseUnappliedMigrations: 0,
      redisStatus: 'OK',
      celeryStatus: 'OK',
      indexStatus: 'OK',
      indexLastModified: null,
      classifierStatus: 'OK',
      classifierLastTrained: null,
      sanityCheckStatus: 'OK',
      sanityCheckLastRun: null,
    }),
    getStatistics: vi.fn().mockResolvedValue({
      documentsTotal: 100,
      documentsInbox: 5,
      inboxTag: 1,
      documentFileTypeCount: [],
      characterCount: 50000,
      tagCount: null,
      correspondentCount: null,
      documentTypeCount: null,
      storagePathCount: null,
    }),
    getTags: vi.fn().mockResolvedValue([]),
    getCorrespondents: vi.fn().mockResolvedValue([]),
    getDocumentTypes: vi.fn().mockResolvedValue([]),
    getStoragePaths: vi.fn().mockResolvedValue([]),
    getGroupCount: vi.fn().mockResolvedValue(2),
    getUserCount: vi.fn().mockResolvedValue(5),
    getRemoteVersion: vi.fn().mockResolvedValue({ version: '2.0.0', updateAvailable: false }),
  } as unknown as PaperlessClient;
}

describe('PaperlessMetricsCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['resolve', 'reject'] as const)(
    'skips overlapping ticks and resumes after a collector %s',
    async (outcome) => {
      vi.clearAllMocks();
      const client = createMockClient();
      let resolve!: (count: number) => void;
      let reject!: (error: Error) => void;
      vi.mocked(client.getGroupCount).mockReturnValueOnce(
        new Promise<number>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      const coordinator = new PaperlessMetricsCoordinator({
        client,
        enabledCollectors: ['group'],
        collectionIntervalMs: 1000,
      });
      coordinator.start();
      const logger = vi.mocked(createLogger).mock.results[0].value;
      const meter = metrics.getMeter('paperless-metrics');
      const counter = vi.mocked(meter.createCounter).mock.results[0].value;
      try {
        await vi.advanceTimersByTimeAsync(3000);
        expect(client.getGroupCount).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledWith(
          { intervalMs: 1000 },
          'Paperless metrics collection still running, skipping this tick',
        );
        expect(counter.add).not.toHaveBeenCalled();
        expect(meter.createCounter).toHaveBeenCalledTimes(1);
        if (outcome === 'resolve') resolve(2);
        else reject(new Error('synthetic collector failure'));
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(1000);
        expect(client.getGroupCount).toHaveBeenCalledTimes(2);
        expect(counter.add).toHaveBeenCalledTimes(outcome === 'reject' ? 1 : 0);
        if (outcome === 'reject')
          expect(counter.add).toHaveBeenCalledWith(1, { collector: 'group' });
      } finally {
        resolve(2);
        coordinator.shutdown();
      }
    },
  );

  it('starts with all collectors by default', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({ client });
    coordinator.start();

    // All collectors should be called including remote_version
    expect(client.getStatus).toHaveBeenCalled();
    expect(client.getStatistics).toHaveBeenCalledTimes(1);
    expect(client.getRemoteVersion).toHaveBeenCalled();
    expect(client.getGroupCount).toHaveBeenCalled();
    expect(client.getUserCount).toHaveBeenCalled();

    coordinator.shutdown();
  });

  it('respects enabledCollectors filter', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['status', 'group'],
    });
    coordinator.start();

    expect(client.getStatus).toHaveBeenCalled();
    expect(client.getGroupCount).toHaveBeenCalled();

    // Not enabled
    expect(client.getTags).not.toHaveBeenCalled();
    expect(client.getUserCount).not.toHaveBeenCalled();
    expect(client.getRemoteVersion).not.toHaveBeenCalled();

    coordinator.shutdown();
  });

  it('shares statistics within a collection cycle but refreshes on the next cycle', async () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['statistics', 'document'],
      collectionIntervalMs: 1_000,
    });
    coordinator.start();

    expect(client.getStatistics).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.getStatistics).toHaveBeenCalledTimes(2);
    coordinator.shutdown();
  });

  it('can include remote_version via enabledCollectors', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['status', 'remote_version'],
    });
    coordinator.start();

    expect(client.getStatus).toHaveBeenCalled();
    expect(client.getRemoteVersion).toHaveBeenCalled();

    coordinator.shutdown();
  });

  it('skips unknown collector IDs with warning', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['status', 'nonexistent'],
    });
    coordinator.start();

    expect(client.getStatus).toHaveBeenCalled();

    coordinator.shutdown();
  });

  it('handles collector errors without crashing', async () => {
    const client = createMockClient();
    (client.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));

    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['status', 'group'],
    });
    coordinator.start();

    // Wait for initial collection to settle
    await vi.advanceTimersByTimeAsync(0);

    // group should still have been called despite status failing
    expect(client.getGroupCount).toHaveBeenCalled();

    coordinator.shutdown();
  });

  it('shuts down cleanly', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({
      client,
      enabledCollectors: ['status'],
    });
    coordinator.start();
    coordinator.shutdown();

    // Calling shutdown again should be safe
    coordinator.shutdown();
  });
});

describe('COLLECTOR_IDS', () => {
  it('contains 10 collector IDs', () => {
    expect(COLLECTOR_IDS).toHaveLength(10);
  });

  it('includes remote_version', () => {
    expect(COLLECTOR_IDS).toContain('remote_version');
  });
});
