import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';

export class GroupCollector implements Collector {
  readonly id = 'group' as const;

  private groups!: ObservableGauge;
  private latest: number | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.groups = meter.createObservableGauge('paperless_groups', {
      description: 'Number of user groups.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (this.latest !== null) {
          result.observe(this.groups, this.latest);
        }
      },
      [this.groups],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getGroupCount();
  }
}
