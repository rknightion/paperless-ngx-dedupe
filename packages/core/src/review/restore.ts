import { sql } from 'drizzle-orm';
import { type AppDatabase } from '../db/client.js';
import { type PaperlessClient } from '../paperless/client.js';
import { PaperlessApiError } from '../paperless/errors.js';
import { assertOperationLeaseOwnership } from '../scheduler/coordinator.js';
import { syncDocumentsById } from '../sync/sync-documents.js';
import { type SyncProgressCallback } from '../sync/types.js';

export interface CompletedDeletionRun {
  planId: string;
  completedAt: string;
  documentsDeleted: number;
  groups: string[];
}

export class DeletionRunNotFoundError extends Error {
  constructor() {
    super('Completed deletion run not found');
    this.name = 'DeletionRunNotFoundError';
  }
}

/** Require a completed deletion plan; expiry does not prevent restoring retained checkpoints. */
export function assertCompletedDeletionRun(db: AppDatabase, planId: string): void {
  if (
    !db.get(sql`SELECT 1 FROM reviewed_mutation_plan
    WHERE id = ${planId} AND operation = 'duplicate_delete' AND completed_at IS NOT NULL`)
  ) {
    throw new DeletionRunNotFoundError();
  }
}

/** List completed deletion runs; groups contains their checkpoint group IDs in review order. */
export function listCompletedDeletionRuns(db: AppDatabase, limit = 20): CompletedDeletionRun[] {
  const rows = db.all<{
    planId: string;
    completedAt: string;
    documentsDeleted: number;
    groupsJson: string;
  }>(sql`
    SELECT p.id AS planId, p.completed_at AS completedAt,
      (SELECT COUNT(DISTINCT d.paperless_id) FROM reviewed_mutation_document_checkpoint d
       WHERE d.plan_id = p.id AND d.outcome = 'deleted') AS documentsDeleted,
      (SELECT json_group_array(group_id) FROM (
        SELECT group_id FROM reviewed_mutation_group_checkpoint g
        WHERE g.plan_id = p.id ORDER BY ordinal
      )) AS groupsJson
    FROM reviewed_mutation_plan p
    WHERE p.operation = 'duplicate_delete' AND p.completed_at IS NOT NULL
    ORDER BY p.completed_at DESC, p.id DESC LIMIT ${limit}
  `);
  return rows.map(({ groupsJson, ...row }) => ({ ...row, groups: JSON.parse(groupsJson) }));
}

/** Restore a completed run under its worker's existing duplicate mutation lease. */
export async function restoreDeletionRun(
  { db, client }: { db: AppDatabase; client: PaperlessClient },
  planId: string,
  options: { leaseOwnerId: string; onProgress?: SyncProgressCallback },
): Promise<{ restored: number; notRestorable: number }> {
  assertOperationLeaseOwnership(db.$client, 'duplicate_delete', options.leaseOwnerId);
  assertCompletedDeletionRun(db, planId);
  const ids = db
    .all<{ id: number }>(
      sql`
    SELECT DISTINCT paperless_id AS id FROM reviewed_mutation_document_checkpoint
    WHERE plan_id = ${planId} AND outcome = 'deleted' ORDER BY paperless_id
  `,
    )
    .map((row) => row.id);
  if (ids.length === 0) return { restored: 0, notRestorable: 0 };

  async function inTrash(selected: readonly number[], progress: number): Promise<number[]> {
    const wanted = new Set(selected);
    const available = new Set<number>();
    for await (const page of client.getTrashDocumentIds()) {
      await options.onProgress?.(progress, 'Checking recycle bin');
      for (const id of page) if (wanted.has(id)) available.add(id);
    }
    return selected.filter((id) => available.has(id));
  }

  await options.onProgress?.(0, 'Checking recycle bin');
  const available = await inTrash(ids, 0);
  const restored = new Set<number>();
  for (let offset = 0; offset < available.length; offset += 100) {
    let pending = available.slice(offset, offset + 100);
    const progress = (offset / available.length) * 0.5;
    while (pending.length > 0) {
      await options.onProgress?.(progress, 'Restoring selected documents');
      try {
        const confirmed = new Set(await client.restoreFromTrash(pending));
        if (confirmed.size !== pending.length || pending.some((id) => !confirmed.has(id))) {
          throw new Error('Unexpected recycle-bin restore response');
        }
        for (const id of pending) restored.add(id);
        break;
      } catch (error) {
        if (!(error instanceof PaperlessApiError) || error.statusCode !== 400) throw error;
        const remaining = await inTrash(pending, progress);
        // Retry only when the bin changed; every retry strictly reduces the selection.
        if (remaining.length === pending.length) throw error;
        pending = remaining;
      }
    }
  }

  // Refresh all selected IDs so retrying after a restore acknowledgement was lost
  // also repairs local state for documents that are already out of the bin.
  const refreshed = await syncDocumentsById({ db, client }, ids, {
    onProgress: async (progress, message) => options.onProgress?.(0.5 + progress * 0.5, message),
  });
  for (const id of refreshed.notFound) restored.delete(id);
  return { restored: restored.size, notRestorable: ids.length - restored.size };
}
