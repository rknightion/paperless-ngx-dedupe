import { and, desc, eq, lt, or } from 'drizzle-orm';
import { type AppDatabase } from '../db/client.js';
import { duplicatePairDecision } from '../schema/sqlite/duplicates.js';

type PairDecisionSource = typeof duplicatePairDecision.$inferInsert.source;

/** Return the same suppression key regardless of the order of the two Paperless IDs. */
export function pairDecisionKey(a: number, b: number): string {
  return `${Math.min(a, b)}|${Math.max(a, b)}`;
}

/** Record every distinct pair atomically, preserving the first decision on repeated input.
 * Reject more than 200 input IDs or non-positive, non-integer IDs before writing. */
export function recordPairDecisions(
  db: AppDatabase,
  paperlessIds: number[],
  source: PairDecisionSource,
): { recorded: number } {
  if (paperlessIds.length > 200)
    throw new RangeError('A pair decision batch accepts at most 200 IDs');
  if (paperlessIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new RangeError('Paperless IDs must be positive safe integers');
  const ids = [...new Set(paperlessIds)].sort((a, b) => a - b);
  const createdAt = new Date().toISOString();
  const rows: (typeof duplicatePairDecision.$inferInsert)[] = [];
  for (let low = 0; low < ids.length; low++)
    for (let high = low + 1; high < ids.length; high++)
      rows.push({
        paperlessIdLow: ids[low],
        paperlessIdHigh: ids[high],
        decision: 'not_duplicate',
        source,
        createdAt,
      });
  return db.transaction((tx) => {
    let recorded = 0;
    // Bound each statement below SQLite's variable limit, including generated IDs.
    for (let offset = 0; offset < rows.length; offset += 1000)
      recorded += tx
        .insert(duplicatePairDecision)
        .values(rows.slice(offset, offset + 1000))
        .onConflictDoNothing({
          target: [duplicatePairDecision.paperlessIdLow, duplicatePairDecision.paperlessIdHigh],
        })
        .run().changes;
    return { recorded };
  });
}

/** Load stable Paperless pair keys once for an analysis run. */
export function loadSuppressedPairSet(db: AppDatabase): Set<string> {
  return new Set(
    db
      .select({
        low: duplicatePairDecision.paperlessIdLow,
        high: duplicatePairDecision.paperlessIdHigh,
      })
      .from(duplicatePairDecision)
      .all()
      .map((row) => pairDecisionKey(row.low, row.high)),
  );
}

/** List newest decisions first; a cursor whose row was deleted raises RangeError. */
export function listPairDecisions(
  db: AppDatabase,
  { limit, cursor }: { limit: number; cursor?: string },
): { items: (typeof duplicatePairDecision.$inferSelect)[]; nextCursor: string | null } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new RangeError('Pair decision limit must be an integer from 1 to 200');
  const after =
    cursor === undefined
      ? undefined
      : db
          .select({ id: duplicatePairDecision.id, createdAt: duplicatePairDecision.createdAt })
          .from(duplicatePairDecision)
          .where(eq(duplicatePairDecision.id, cursor))
          .get();
  if (cursor !== undefined && !after) throw new RangeError('Pair decision cursor no longer exists');
  const rows = db
    .select()
    .from(duplicatePairDecision)
    .where(
      after
        ? or(
            lt(duplicatePairDecision.createdAt, after.createdAt),
            and(
              eq(duplicatePairDecision.createdAt, after.createdAt),
              lt(duplicatePairDecision.id, after.id),
            ),
          )
        : undefined,
    )
    .orderBy(desc(duplicatePairDecision.createdAt), desc(duplicatePairDecision.id))
    .limit(limit + 1)
    .all();
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}

/** Remove one remembered decision, returning whether it existed. */
export function deletePairDecision(db: AppDatabase, id: string): boolean {
  return db.delete(duplicatePairDecision).where(eq(duplicatePairDecision.id, id)).run().changes > 0;
}
