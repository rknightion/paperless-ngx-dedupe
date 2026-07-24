export const OPERATION_KINDS = [
  'sync',
  'analysis',
  'duplicate_delete',
  'ai_processing',
  'ai_apply',
  'ai_revert',
  'custom_field_discovery',
  'backup',
  'checkpoint',
  'vacuum',
  'job_cleanup',
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];

/** JSON-serializable route options persisted with a dispatch intent. */
export type DispatchTaskData = unknown;

export function serializeDispatchTaskData(taskData: DispatchTaskData | undefined): string | null {
  return taskData === undefined ? null : (JSON.stringify(taskData) ?? null);
}

export function deserializeDispatchTaskData(taskDataJson: string | null): DispatchTaskData {
  return taskDataJson === null ? undefined : JSON.parse(taskDataJson);
}

const MUTATING_OPERATIONS = new Set<OperationKind>([
  'sync',
  'analysis',
  'duplicate_delete',
  'ai_processing',
  'ai_apply',
  'ai_revert',
  'custom_field_discovery',
]);

/**
 * The authoritative concurrency policy. Work that reads or changes the
 * document/analysis state serializes with other document work. Backups and
 * checkpoints are safe alongside ordinary work, while VACUUM is exclusive.
 * Job retention is compatible because dispatch intent keeps its own lineage.
 */
export const OPERATION_COMPATIBILITY: Record<
  OperationKind,
  Record<OperationKind, boolean>
> = Object.fromEntries(
  OPERATION_KINDS.map((left) => [
    left,
    Object.fromEntries(
      OPERATION_KINDS.map((right) => {
        // The durable operation_lease uniqueness constraint makes same-type
        // serialization the minimum guarantee, even for maintenance work.
        if (left === right) return [right, false];
        if (left === 'vacuum' || right === 'vacuum') return [right, false];
        if (left === 'job_cleanup' || right === 'job_cleanup') return [right, true];
        if (
          left === 'backup' ||
          left === 'checkpoint' ||
          right === 'backup' ||
          right === 'checkpoint'
        ) {
          return [right, true];
        }
        return [right, !(MUTATING_OPERATIONS.has(left) && MUTATING_OPERATIONS.has(right))];
      }),
    ),
  ]),
) as Record<OperationKind, Record<OperationKind, boolean>>;
