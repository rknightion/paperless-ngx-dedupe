import { type Database } from 'better-sqlite3';

/** Keep claimed history, recent previews and unresolved budget reservations. */
export function pruneExpiredReviewState(
  sqlite: Database,
  now: Date = new Date(),
): { plansDeleted: number; reservationsDeleted: number } {
  const planCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  return sqlite.transaction(() => {
    const plansDeleted = sqlite
      .prepare(
        'DELETE FROM reviewed_mutation_plan WHERE claimed_by_job_id IS NULL AND expires_at < ?',
      )
      .run(planCutoff).changes;
    const reservationsDeleted = sqlite
      .prepare("DELETE FROM ai_budget_reservation WHERE status != 'reserved' AND billing_month < ?")
      .run(previousMonth).changes;
    return { plansDeleted, reservationsDeleted };
  })();
}
