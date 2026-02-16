import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';

export class DocumentCollector implements Collector {
  readonly id = 'document' as const;

  private documents!: ObservableGauge;
  private latest: number | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.documents = meter.createObservableGauge('paperless_documents', {
      description: 'Total number of documents.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (this.latest !== null) {
          result.observe(this.documents, this.latest);
        }
      },
      [this.documents],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    const stats = await ctx.client.getStatistics();
    this.latest = stats.documentsTotal;
  }
}
