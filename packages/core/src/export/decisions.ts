import { z } from 'zod';
import {
  loadSuppressedPairSet,
  pairDecisionKey,
  recordPairDecisions,
} from '../dedup/pair-decisions.js';
import { asc, eq, inArray } from 'drizzle-orm';
import { type AppDatabase } from '../db/client.js';
import { document } from '../schema/sqlite/documents.js';
import {
  duplicateGroup,
  duplicateMember,
  duplicatePairDecision,
} from '../schema/sqlite/duplicates.js';

export interface DecisionBackup {
  version: 1;
  exportedAt: string;
  groups: { paperlessIds: number[]; status: 'false_positive' | 'ignored'; decidedAt: string }[];
  pairDecisions: [number, number][];
}

/** Export review identities without local IDs, document contents, AI results or settings. */
export function exportDecisions(db: AppDatabase): DecisionBackup {
  return db.transaction((tx) => {
    const groups = tx
      .select({
        id: duplicateGroup.id,
        status: duplicateGroup.status,
        decidedAt: duplicateGroup.updatedAt,
      })
      .from(duplicateGroup)
      .where(inArray(duplicateGroup.status, ['false_positive', 'ignored']))
      .orderBy(asc(duplicateGroup.id))
      .all();
    const members = tx
      .select({ groupId: duplicateMember.groupId, paperlessId: document.paperlessId })
      .from(duplicateMember)
      .innerJoin(duplicateGroup, eq(duplicateGroup.id, duplicateMember.groupId))
      .innerJoin(document, eq(document.id, duplicateMember.documentId))
      .where(inArray(duplicateGroup.status, ['false_positive', 'ignored']))
      .orderBy(asc(document.paperlessId))
      .all();
    const byGroup = new Map<string, number[]>();
    for (const member of members) {
      const ids = byGroup.get(member.groupId) ?? [];
      ids.push(member.paperlessId);
      byGroup.set(member.groupId, ids);
    }
    const pairs = tx
      .select({
        low: duplicatePairDecision.paperlessIdLow,
        high: duplicatePairDecision.paperlessIdHigh,
      })
      .from(duplicatePairDecision)
      .orderBy(
        asc(duplicatePairDecision.paperlessIdLow),
        asc(duplicatePairDecision.paperlessIdHigh),
      )
      .all();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: groups.map((group) => ({
        paperlessIds: byGroup.get(group.id) ?? [],
        status: group.status as 'false_positive' | 'ignored',
        decidedAt: group.decidedAt,
      })),
      pairDecisions: pairs.map((pair) => [pair.low, pair.high]),
    };
  });
}

const paperlessId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid date');
const decisionBackupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: timestamp,
    groups: z.array(
      z
        .object({
          paperlessIds: z
            .array(paperlessId)
            .refine((ids) => new Set(ids).size === ids.length, 'Duplicate document ID'),
          status: z.enum(['false_positive', 'ignored']),
          decidedAt: timestamp,
        })
        .strict(),
    ),
    pairDecisions: z.array(
      z
        .tuple([paperlessId, paperlessId])
        .refine(([a, b]) => a < b, 'Pair IDs must be ordered and distinct'),
    ),
  })
  .strict();

/** Replay local review decisions, or calculate the same result without writing anything.
 * Unmatched false-positive groups share the pair store's 200-member safety limit. */
export function importDecisions(db: AppDatabase, data: unknown, { dryRun }: { dryRun: boolean }) {
  const backup = decisionBackupSchema.parse(data);
  const keyFor = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
  const bySet = new Map<string, (typeof backup.groups)[number]>();
  for (const [index, group] of backup.groups.entries()) {
    const key = keyFor(group.paperlessIds);
    if (bySet.has(key) && bySet.get(key)!.status !== group.status)
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['groups', index],
          message: 'Conflicting decisions for the same document set',
        },
      ]);
    bySet.set(key, group);
  }
  return db.transaction(
    (tx) => {
      const rows = tx
        .select({
          groupId: duplicateGroup.id,
          status: duplicateGroup.status,
          paperlessId: document.paperlessId,
        })
        .from(duplicateGroup)
        .leftJoin(duplicateMember, eq(duplicateMember.groupId, duplicateGroup.id))
        .leftJoin(document, eq(document.id, duplicateMember.documentId))
        .all();
      const local = new Map<string, { status: string; ids: number[] }>();
      for (const row of rows) {
        const group = local.get(row.groupId) ?? { status: row.status, ids: [] };
        if (row.paperlessId !== null) group.ids.push(row.paperlessId);
        local.set(row.groupId, group);
      }
      const pending = new Map<string, string[]>();
      const resolved = new Set<string>();
      for (const [id, group] of local) {
        const key = keyFor(group.ids);
        if (group.status === 'pending') pending.set(key, [...(pending.get(key) ?? []), id]);
        else resolved.add(`${key}:${group.status}`);
      }
      const pairs = new Map<string, [number, number]>();
      for (const pair of backup.pairDecisions) pairs.set(pairDecisionKey(...pair), pair);
      const updates: { id: string; status: 'false_positive' | 'ignored' }[] = [];
      let groupsUnmatched = 0;
      for (const [key, group] of bySet) {
        const matches = pending.get(key) ?? [];
        for (const id of matches) updates.push({ id, status: group.status });
        if (matches.length > 0) continue;
        groupsUnmatched++;
        // A replay of an already restored group must not create additional pairs.
        if (group.status !== 'false_positive' || resolved.has(`${key}:${group.status}`)) continue;
        if (group.paperlessIds.length > 200)
          throw new z.ZodError([
            {
              code: 'custom',
              path: ['groups'],
              message: 'Unmatched false-positive groups accept at most 200 members',
            },
          ]);
        const ids = [...group.paperlessIds].sort((a, b) => a - b);
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++)
            pairs.set(pairDecisionKey(ids[i], ids[j]), [ids[i], ids[j]]);
      }
      const existing = loadSuppressedPairSet(db);
      const additions = [...pairs].filter(([key]) => !existing.has(key)).map(([, pair]) => pair);
      if (!dryRun) {
        const updatedAt = new Date().toISOString();
        for (const update of updates)
          tx.update(duplicateGroup)
            .set({ status: update.status, updatedAt })
            .where(eq(duplicateGroup.id, update.id))
            .run();
        for (const pair of additions) recordPairDecisions(db, pair, 'import');
      }
      return {
        groupsMatched: updates.length,
        groupsUnmatched,
        pairDecisionsAdded: additions.length,
      };
    },
    { behavior: 'immediate' },
  );
}
