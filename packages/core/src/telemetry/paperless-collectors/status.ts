import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessStatus } from '../../paperless/types.js';

function isOk(status: string): number {
  return status.toUpperCase() === 'OK' ? 1 : 0;
}

function isoToUnix(iso: string | null): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return isNaN(ts) ? 0 : ts / 1000;
}

export class StatusCollector implements Collector {
  readonly id = 'status' as const;

  private storageTotal!: ObservableGauge;
  private storageAvailable!: ObservableGauge;
  private databaseStatus!: ObservableGauge;
  private databaseUnappliedMigrations!: ObservableGauge;
  private redisStatus!: ObservableGauge;
  private celeryStatus!: ObservableGauge;
  private indexStatus!: ObservableGauge;
  private indexLastModified!: ObservableGauge;
  private classifierStatus!: ObservableGauge;
  private classifierLastTrained!: ObservableGauge;
  private sanityCheckStatus!: ObservableGauge;
  private sanityCheckLastRun!: ObservableGauge;

  private latest: PaperlessStatus | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.storageTotal = meter.createObservableGauge('paperless_status_storage_total_bytes', {
      description: 'Total storage of Paperless in bytes.',
      unit: 'By',
    });
    this.storageAvailable = meter.createObservableGauge(
      'paperless_status_storage_available_bytes',
      { description: 'Available storage of Paperless in bytes.', unit: 'By' },
    );
    this.databaseStatus = meter.createObservableGauge('paperless_status_database_status', {
      description: 'Status of the database. 1 is OK, 0 is not OK.',
    });
    this.databaseUnappliedMigrations = meter.createObservableGauge(
      'paperless_status_database_unapplied_migrations',
      { description: 'Number of unapplied database migrations.' },
    );
    this.redisStatus = meter.createObservableGauge('paperless_status_redis_status', {
      description: 'Status of redis. 1 is OK, 0 is not OK.',
    });
    this.celeryStatus = meter.createObservableGauge('paperless_status_celery_status', {
      description: 'Status of celery. 1 is OK, 0 is not OK.',
    });
    this.indexStatus = meter.createObservableGauge('paperless_status_index_status', {
      description: 'Status of the index. 1 is OK, 0 is not OK.',
    });
    this.indexLastModified = meter.createObservableGauge(
      'paperless_status_index_last_modified_timestamp_seconds',
      { description: 'Seconds since epoch of the last index modification.', unit: 's' },
    );
    this.classifierStatus = meter.createObservableGauge('paperless_status_classifier_status', {
      description: 'Status of the classifier. 1 is OK, 0 is not OK.',
    });
    this.classifierLastTrained = meter.createObservableGauge(
      'paperless_status_classifier_last_trained_timestamp_seconds',
      { description: 'Seconds since epoch of the last classifier training.', unit: 's' },
    );
    this.sanityCheckStatus = meter.createObservableGauge('paperless_status_sanity_check_status', {
      description: 'Status of the sanity check. 1 is OK, 0 is not OK.',
    });
    this.sanityCheckLastRun = meter.createObservableGauge(
      'paperless_status_sanity_check_last_run_timestamp_seconds',
      { description: 'Seconds since epoch of the last sanity check run.', unit: 's' },
    );

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        const d = this.latest;
        if (!d) return;

        result.observe(this.storageTotal, d.storageTotal);
        result.observe(this.storageAvailable, d.storageAvailable);
        result.observe(this.databaseStatus, isOk(d.databaseStatus));
        result.observe(this.databaseUnappliedMigrations, d.databaseUnappliedMigrations);
        result.observe(this.redisStatus, isOk(d.redisStatus));
        result.observe(this.celeryStatus, isOk(d.celeryStatus));
        result.observe(this.indexStatus, isOk(d.indexStatus));
        result.observe(this.indexLastModified, isoToUnix(d.indexLastModified));
        result.observe(this.classifierStatus, isOk(d.classifierStatus));
        result.observe(this.classifierLastTrained, isoToUnix(d.classifierLastTrained));
        result.observe(this.sanityCheckStatus, isOk(d.sanityCheckStatus));
        result.observe(this.sanityCheckLastRun, isoToUnix(d.sanityCheckLastRun));
      },
      [
        this.storageTotal,
        this.storageAvailable,
        this.databaseStatus,
        this.databaseUnappliedMigrations,
        this.redisStatus,
        this.celeryStatus,
        this.indexStatus,
        this.indexLastModified,
        this.classifierStatus,
        this.classifierLastTrained,
        this.sanityCheckStatus,
        this.sanityCheckLastRun,
      ],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getStatus();
  }
}
