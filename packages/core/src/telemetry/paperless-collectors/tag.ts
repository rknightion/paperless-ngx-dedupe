import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessTag } from '../../paperless/types.js';

export class TagCollector implements Collector {
  readonly id = 'tag' as const;

  private info!: ObservableGauge;
  private documentCount!: ObservableGauge;
  private inbox!: ObservableGauge;

  private latest: PaperlessTag[] | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.info = meter.createObservableGauge('paperless_tag_info', {
      description: 'Static information about a tag.',
    });
    this.documentCount = meter.createObservableGauge('paperless_tag_document_count', {
      description: 'Number of documents with this tag.',
    });
    this.inbox = meter.createObservableGauge('paperless_tag_inbox', {
      description: 'Whether the tag is an inbox tag. 1 is inbox, 0 is not.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;

        for (const tag of this.latest) {
          const id = String(tag.id);
          result.observe(this.info, 1, { id, name: tag.name, slug: tag.slug });
          result.observe(this.documentCount, tag.documentCount, { id });
          result.observe(this.inbox, tag.isInboxTag ? 1 : 0, { id });
        }
      },
      [this.info, this.documentCount, this.inbox],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getTags();
  }
}
