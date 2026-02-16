import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessCorrespondent } from '../../paperless/types.js';

function isoToUnix(iso: string | null): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return isNaN(ts) ? 0 : ts / 1000;
}

export class CorrespondentCollector implements Collector {
  readonly id = 'correspondent' as const;

  private info!: ObservableGauge;
  private documentCount!: ObservableGauge;
  private lastCorrespondence!: ObservableGauge;

  private latest: PaperlessCorrespondent[] | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.info = meter.createObservableGauge('paperless_correspondent_info', {
      description: 'Static information about a correspondent.',
    });
    this.documentCount = meter.createObservableGauge('paperless_correspondent_document_count', {
      description: 'Number of documents for this correspondent.',
    });
    this.lastCorrespondence = meter.createObservableGauge(
      'paperless_correspondent_last_correspondence_timestamp_seconds',
      { description: 'Seconds since epoch of the last correspondence.', unit: 's' },
    );

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;

        for (const c of this.latest) {
          const id = String(c.id);
          result.observe(this.info, 1, { id, name: c.name, slug: c.slug });
          result.observe(this.documentCount, c.documentCount, { id });
          result.observe(this.lastCorrespondence, isoToUnix(c.lastCorrespondence), { id });
        }
      },
      [this.info, this.documentCount, this.lastCorrespondence],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getCorrespondents();
  }
}
