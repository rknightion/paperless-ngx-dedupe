import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessRemoteVersion } from '../../paperless/types.js';

export class RemoteVersionCollector implements Collector {
  readonly id = 'remote_version' as const;

  private updateAvailable!: ObservableGauge;
  private latest: PaperlessRemoteVersion | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.updateAvailable = meter.createObservableGauge(
      'paperless_remote_version_update_available',
      { description: 'Whether a Paperless-NGX update is available. 1 is available, 0 is current.' },
    );

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;
        result.observe(this.updateAvailable, this.latest.updateAvailable ? 1 : 0, {
          version: this.latest.version,
        });
      },
      [this.updateAvailable],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getRemoteVersion();
  }
}
