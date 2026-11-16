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
