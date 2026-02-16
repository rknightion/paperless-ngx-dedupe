import { metrics, type Counter } from '@opentelemetry/api';
import { createLogger } from '../../logger.js';
import type { PaperlessClient } from '../../paperless/client.js';
import type { Logger } from '../../logger.js';
import {
  METER_NAME,
  COLLECTOR_IDS,
  type Collector,
  type CollectorContext,
  type CollectorId,
} from './types.js';
import { StatusCollector } from './status.js';
import { StatisticsCollector } from './statistics.js';
import { DocumentCollector } from './document.js';
import { TagCollector } from './tag.js';
import { CorrespondentCollector } from './correspondent.js';
import { DocumentTypeCollector } from './document-type.js';
import { StoragePathCollector } from './storage-path.js';
import { TaskCollector } from './task.js';
import { GroupCollector } from './group.js';
import { UserCollector } from './user.js';
import { RemoteVersionCollector } from './remote-version.js';

export interface PaperlessMetricsOptions {
  client: PaperlessClient;
  enabledCollectors?: string[];
  collectionIntervalMs?: number;
}

const COLLECTOR_FACTORIES: Record<CollectorId, () => Collector> = {
  status: () => new StatusCollector(),
  statistics: () => new StatisticsCollector(),
  document: () => new DocumentCollector(),
  tag: () => new TagCollector(),
  correspondent: () => new CorrespondentCollector(),
  document_type: () => new DocumentTypeCollector(),
  storage_path: () => new StoragePathCollector(),
  task: () => new TaskCollector(),
  group: () => new GroupCollector(),
  user: () => new UserCollector(),
  remote_version: () => new RemoteVersionCollector(),
};

export class PaperlessMetricsCoordinator {
  private collectors: Collector[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private errorsCounter!: Counter;
  private readonly logger: Logger;
  private readonly ctx: CollectorContext;
  private readonly collectionIntervalMs: number;

  constructor(private readonly opts: PaperlessMetricsOptions) {
    this.logger = createLogger('paperless-metrics');
    const meter = metrics.getMeter(METER_NAME);
    this.ctx = { client: opts.client, meter, logger: this.logger };
    this.collectionIntervalMs = opts.collectionIntervalMs ?? 60_000;
  }

  start(): void {
    const enabledIds = this.resolveCollectorIds();

    if (enabledIds.length === 0) {
      this.logger.warn('No valid Paperless metrics collectors enabled');
      return;
    }

    this.logger.info(
      { collectors: enabledIds },
      `Starting Paperless metrics collection (${enabledIds.length} collectors)`,
    );

    this.errorsCounter = this.ctx.meter.createCounter('paperless_collector_errors_total', {
      description: 'Total collection errors by collector.',
    });

    for (const id of enabledIds) {
      const collector = COLLECTOR_FACTORIES[id]();
      collector.register(this.ctx);
      this.collectors.push(collector);
    }

    // Run an initial collection, then start the interval
    void this.collectAll();
    this.intervalHandle = setInterval(() => void this.collectAll(), this.collectionIntervalMs);
    this.intervalHandle.unref();
  }

  shutdown(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    for (const c of this.collectors) {
      c.shutdown?.();
    }
    this.collectors = [];
  }

  private async collectAll(): Promise<void> {
    await Promise.allSettled(
      this.collectors.map((c) =>
        c.collect(this.ctx).catch((err: unknown) => {
          this.logger.warn({ collector: c.id, err }, 'Paperless metrics collector failed');
          this.errorsCounter.add(1, { collector: c.id });
        }),
      ),
    );
  }

  private resolveCollectorIds(): CollectorId[] {
    const { enabledCollectors } = this.opts;

    if (enabledCollectors && enabledCollectors.length > 0) {
      const ids: CollectorId[] = [];
      for (const raw of enabledCollectors) {
        const id = raw as CollectorId;
        if (COLLECTOR_IDS.includes(id)) {
          ids.push(id);
        } else {
          this.logger.warn({ collector: raw }, 'Unknown Paperless metrics collector, skipping');
        }
      }
      return ids;
    }

    // Default: all collectors
    return [...COLLECTOR_IDS];
  }
}
