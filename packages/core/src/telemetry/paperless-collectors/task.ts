import type { ObservableGauge, BatchObservableResult } from '@opentelemetry/api';
import type { Collector, CollectorContext } from './types.js';
import type { PaperlessTask } from '../../paperless/types.js';

function isoToUnix(iso: string | null): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return isNaN(ts) ? 0 : ts / 1000;
}

interface TaskSnapshot {
  tasks: PaperlessTask[];
  statusNames: Set<string>;
}

export class TaskCollector implements Collector {
  readonly id = 'task' as const;

  private info!: ObservableGauge;
  private created!: ObservableGauge;
  private done!: ObservableGauge;
  private status!: ObservableGauge;
  private filename!: ObservableGauge;
  private statusInfo!: ObservableGauge;

  private latest: TaskSnapshot | null = null;
  private knownStatuses = new Set<string>();

  register(ctx: CollectorContext): void {
    const { meter } = ctx;

    this.info = meter.createObservableGauge('paperless_task_info', {
      description: 'Static information about a task.',
    });
    this.created = meter.createObservableGauge('paperless_task_created_timestamp_seconds', {
      description: 'Seconds since epoch of the task creation.',
      unit: 's',
    });
    this.done = meter.createObservableGauge('paperless_task_done_timestamp_seconds', {
      description: 'Seconds since epoch of when the task finished.',
      unit: 's',
    });
    this.status = meter.createObservableGauge('paperless_task_status', {
      description: 'Task status.',
    });
    this.filename = meter.createObservableGauge('paperless_task_filename', {
      description: 'Filename associated with the task (if any).',
    });
    this.statusInfo = meter.createObservableGauge('paperless_task_status_info', {
      description: 'Task status names.',
    });

    meter.addBatchObservableCallback(
      (result: BatchObservableResult) => {
        if (!this.latest) return;

        for (const task of this.latest.tasks) {
          const id = String(task.id);
          const taskStatus = task.status.toLowerCase();

          result.observe(this.info, 1, {
            id,
            task_id: task.taskId,
            type: task.type,
          });
          result.observe(this.created, isoToUnix(task.created), { id });
          result.observe(this.done, isoToUnix(task.done), { id });
          result.observe(this.status, 1, { id, status: taskStatus });
          result.observe(this.filename, 1, { id, filename: task.taskFileName ?? '' });
        }

        for (const status of this.latest.statusNames) {
          result.observe(this.statusInfo, 1, { status });
        }
      },
      [this.info, this.created, this.done, this.status, this.filename, this.statusInfo],
    );
  }

  async collect(ctx: CollectorContext): Promise<void> {
    const tasks = await ctx.client.getTasks();

    for (const task of tasks) {
      this.knownStatuses.add(task.status.toLowerCase());
    }

    this.latest = {
      tasks,
      statusNames: new Set(this.knownStatuses),
    };
  }
}
