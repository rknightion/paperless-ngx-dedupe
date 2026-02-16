import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessStoragePath } from '../../paperless/types.js';

export class StoragePathCollector implements Collector {
  readonly id = 'storage_path' as const;

  private info!: ObservableGauge;
  private documentCount!: ObservableGauge;

  private latest: PaperlessStoragePath[] | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.info = meter.createObservableGauge('paperless_storage_path_info', {
      description: 'Static information about a storage path.',
    });
    this.documentCount = meter.createObservableGauge('paperless_storage_path_document_count', {
      description: 'Number of documents with this storage path.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;

        for (const sp of this.latest) {
          const id = String(sp.id);
          result.observe(this.info, 1, { id, name: sp.name, slug: sp.slug });
          result.observe(this.documentCount, sp.documentCount, { id });
        }
      },
      [this.info, this.documentCount],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getStoragePaths();
  }
}
