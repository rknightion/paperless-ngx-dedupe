import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PaperlessClient } from '../../../paperless/client.js';
import { PaperlessMetricsCoordinator } from '../coordinator.js';
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
    }),
    getTags: vi.fn().mockResolvedValue([]),
    getCorrespondents: vi.fn().mockResolvedValue([]),
    getDocumentTypes: vi.fn().mockResolvedValue([]),
    getStoragePaths: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
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

  it('starts with all collectors by default', () => {
    const client = createMockClient();
    const coordinator = new PaperlessMetricsCoordinator({ client });
    coordinator.start();

    // All collectors should be called including remote_version
    expect(client.getStatus).toHaveBeenCalled();
    expect(client.getStatistics).toHaveBeenCalledTimes(2); // statistics + document both call it
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
  it('contains 11 collector IDs', () => {
    expect(COLLECTOR_IDS).toHaveLength(11);
  });

  it('includes remote_version', () => {
    expect(COLLECTOR_IDS).toContain('remote_version');
  });
});
