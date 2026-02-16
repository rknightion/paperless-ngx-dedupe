import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';

const TASK_STATUSES = ['SUCCESS', 'FAILURE', 'PENDING', 'STARTED', 'REVOKED'] as const;

export class TaskCollector implements Collector {
  readonly id = 'task' as const;

  private taskCount!: ObservableGauge;
  private latest: Map<string, number> | null = null;

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.taskCount = meter.createObservableGauge('paperless_task_count', {
      description: 'Number of tasks by status.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;
        for (const [status, count] of this.latest) {
          result.observe(this.taskCount, count, { status });
        }
      },
      [this.taskCount],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    const counts = new Map<string, number>();
    await Promise.all(
      TASK_STATUSES.map(async (status) => {
        const count = await ctx.client.getTaskCountByStatus(status);
        counts.set(status.toLowerCase(), count);
      }),
    );
    this.latest = counts;
  }
}
