import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessStatistics } from '../../paperless/types.js';

export class StatisticsCollector implements Collector {
  readonly id = 'statistics' as const;

  private documentsTotal!: ObservableGauge;
  private documentsInbox!: ObservableGauge;
  private fileTypeCounts!: ObservableGauge;
  private characterCount!: ObservableGauge;
  private tagCount!: ObservableGauge;
  private correspondentCount!: ObservableGauge;
  private documentTypeCount!: ObservableGauge;
  private storagePathCount!: ObservableGauge;

  private latest: PaperlessStatistics | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.documentsTotal = meter.createObservableGauge('paperless_statistics_documents_total', {
      description: 'Total number of documents.',
    });
    this.documentsInbox = meter.createObservableGauge(
      'paperless_statistics_documents_inbox_count',
      { description: 'Number of documents in inbox.' },
    );
    this.fileTypeCounts = meter.createObservableGauge(
      'paperless_statistics_documents_file_type_counts',
      { description: 'Number of documents per file type.' },
    );
    this.characterCount = meter.createObservableGauge('paperless_statistics_character_count', {
      description: 'Total number of characters across all documents.',
    });
    this.tagCount = meter.createObservableGauge('paperless_statistics_tag_count', {
      description: 'Total number of tags.',
    });
    this.correspondentCount = meter.createObservableGauge(
      'paperless_statistics_correspondent_count',
      { description: 'Total number of correspondents.' },
    );
    this.documentTypeCount = meter.createObservableGauge(
      'paperless_statistics_document_type_count',
      { description: 'Total number of document types.' },
    );
    this.storagePathCount = meter.createObservableGauge('paperless_statistics_storage_path_count', {
      description: 'Total number of storage paths.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        const d = this.latest;
        if (!d) return;

        result.observe(this.documentsTotal, d.documentsTotal);
        result.observe(this.documentsInbox, d.documentsInbox ?? 0);
        result.observe(this.characterCount, d.characterCount);
        result.observe(this.tagCount, this._tagCount);
        result.observe(this.correspondentCount, this._correspondentCount);
        result.observe(this.documentTypeCount, this._documentTypeCount);
        result.observe(this.storagePathCount, this._storagePathCount);

        for (const ft of d.documentFileTypeCount) {
          result.observe(this.fileTypeCounts, ft.count, { mime_type: ft.mimeType });
        }
      },
      [
        this.documentsTotal,
        this.documentsInbox,
        this.fileTypeCounts,
        this.characterCount,
        this.tagCount,
        this.correspondentCount,
        this.documentTypeCount,
        this.storagePathCount,
      ],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    const stats = await ctx.client.getStatistics();

    // The statistics endpoint doesn't include tag/correspondent/documentType/storagePath counts
    // directly in all Paperless versions. We fetch them separately via the client.
    const [tags, correspondents, documentTypes, storagePaths] = await Promise.all([
      ctx.client.getTags(),
      ctx.client.getCorrespondents(),
      ctx.client.getDocumentTypes(),
      ctx.client.getStoragePaths(),
    ]);

    this.latest = stats;

    // Store counts to be observed in the callback — we do this by updating latest
    // and reading auxiliary data in the callback via closure
    this._tagCount = tags.length;
    this._correspondentCount = correspondents.length;
    this._documentTypeCount = documentTypes.length;
    this._storagePathCount = storagePaths.length;
  }

  private _tagCount = 0;
  private _correspondentCount = 0;
  private _documentTypeCount = 0;
  private _storagePathCount = 0;
}
