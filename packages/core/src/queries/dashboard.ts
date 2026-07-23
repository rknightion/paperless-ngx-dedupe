import { count, eq, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import type { DashboardData } from './types.js';
import { buildNextActions, getReadiness } from './readiness.js';

export function getDashboard(db: AppDatabase): DashboardData {
  // Total documents
  const [{ value: totalDocuments }] = db.select({ value: count() }).from(document).all();

  // Pending analysis
  const [{ value: pendingAnalysis }] = db
    .select({ value: count() })
    .from(document)
    .where(eq(document.processingStatus, 'pending'))
    .all();

  const readiness = getReadiness(db, new Date());

  // Top correspondents with most duplicate groups
  const topCorrespondents = db
    .select({
      correspondent: document.correspondent,
      groupCount: sql<number>`COUNT(DISTINCT ${duplicateMember.groupId})`,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .innerJoin(duplicateGroup, eq(duplicateMember.groupId, duplicateGroup.id))
    .where(sql`${document.correspondent} IS NOT NULL AND ${duplicateGroup.status} = 'pending'`)
    .groupBy(document.correspondent)
    .orderBy(sql`COUNT(DISTINCT ${duplicateMember.groupId}) DESC`)
    .limit(10)
    .all() as { correspondent: string; groupCount: number }[];

  return {
    totalDocuments,
    pendingGroups: readiness.pendingDuplicateGroups,
    pendingAnalysis,
    lastSyncAt: readiness.lastSyncAt,
    lastSyncDocumentCount: readiness.lastSyncDocumentCount,
    lastAnalysisAt: readiness.lastAnalysisAt,
    totalDuplicateGroups: readiness.totalDuplicateGroups,
    topCorrespondents,
    analysisStale: readiness.analysisStale,
    analysisStaleReason: readiness.analysisStaleReason,
    readiness,
    nextActions: buildNextActions(readiness),
  };
}
