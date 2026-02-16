import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessDocumentType } from '../../paperless/types.js';

export class DocumentTypeCollector implements Collector {
  readonly id = 'document_type' as const;

  private info!: ObservableGauge;
  private documentCount!: ObservableGauge;

  private latest: PaperlessDocumentType[] | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.info = meter.createObservableGauge('paperless_document_type_info', {
      description: 'Static information about a document type.',
    });
    this.documentCount = meter.createObservableGauge('paperless_document_type_document_count', {
      description: 'Number of documents with this type.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;

        for (const dt of this.latest) {
          const id = String(dt.id);
          result.observe(this.info, 1, { id, name: dt.name, slug: dt.slug });
          result.observe(this.documentCount, dt.documentCount, { id });
        }
      },
      [this.info, this.documentCount],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getDocumentTypes();
  }
}
