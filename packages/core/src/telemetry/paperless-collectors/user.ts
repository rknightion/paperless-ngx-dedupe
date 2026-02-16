import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';

export class UserCollector implements Collector {
  readonly id = 'user' as const;

  private users!: ObservableGauge;
  private latest: number | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.users = meter.createObservableGauge('paperless_users', {
      description: 'Number of users.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (this.latest !== null) {
          result.observe(this.users, this.latest);
        }
      },
      [this.users],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    this.latest = await ctx.client.getUserCount();
  }
}
