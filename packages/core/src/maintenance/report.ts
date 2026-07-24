import type Database from 'better-sqlite3';

export interface MaintenanceReport {
  activeLeases: Array<{ operation: string; ownerId: string; expiresAt: string | null }>;
  terminalJobs: { total: number; olderThanThirtyDays: number };
  storage: {
    pageCount: number;
    freePageCount: number;
    pageSizeBytes: number;
    allocatedBytes: number;
  };
}

export function getMaintenanceReport(
  sqlite: Database.Database,
  now = new Date(),
): MaintenanceReport {
  const activeLeases = sqlite
    .prepare(
      `SELECT operation, owner_id AS ownerId, expires_at AS expiresAt
       FROM operation_lease
       WHERE expires_at IS NULL OR expires_at > ?
       ORDER BY operation`,
    )
    .all(now.toISOString()) as MaintenanceReport['activeLeases'];
  const retentionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const terminalJobs = sqlite
    .prepare(
      `SELECT count(*) AS total,
       sum(CASE WHEN completed_at IS NOT NULL AND completed_at < ? THEN 1 ELSE 0 END) AS olderThanThirtyDays
       FROM job WHERE status IN ('completed', 'failed', 'cancelled')`,
    )
    .get(retentionCutoff) as { total: number; olderThanThirtyDays: number | null };
  const pageCount = (sqlite.pragma('page_count', { simple: true }) as number) ?? 0;
  const freePageCount = (sqlite.pragma('freelist_count', { simple: true }) as number) ?? 0;
  const pageSizeBytes = (sqlite.pragma('page_size', { simple: true }) as number) ?? 0;

  return {
    activeLeases,
    terminalJobs: {
      total: terminalJobs.total,
      olderThanThirtyDays: terminalJobs.olderThanThirtyDays ?? 0,
    },
    storage: { pageCount, freePageCount, pageSizeBytes, allocatedBytes: pageCount * pageSizeBytes },
  };
}
