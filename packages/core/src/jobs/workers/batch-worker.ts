import { runWorkerTask } from '../worker-entry.js';
import { PaperlessClient, toPaperlessConfig, parseConfig } from '../../index.js';
import { duplicateMember } from '../../schema/sqlite/duplicates.js';
import { duplicateGroup } from '../../schema/sqlite/duplicates.js';
import { document } from '../../schema/sqlite/documents.js';
import { eq, and } from 'drizzle-orm';

interface BatchTaskData {
  groupIds: string[];
}

interface BatchError {
  groupId: string;
  documentId?: string;
  paperlessId?: number;
  error: string;
}

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const paperlessConfig = toPaperlessConfig(config);
  const client = new PaperlessClient(paperlessConfig);

  const taskData = ctx.taskData as BatchTaskData;
  const { groupIds } = taskData;

  let deletedDocuments = 0;
  let resolvedGroups = 0;
  const errors: BatchError[] = [];

  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    await onProgress(
      Math.round((i / groupIds.length) * 100),
      `Processing group ${i + 1} of ${groupIds.length}`,
    );

    // Get non-primary members for this group
    const members = ctx.db
      .select({
        memberId: duplicateMember.id,
        documentId: duplicateMember.documentId,
        isPrimary: duplicateMember.isPrimary,
        paperlessId: document.paperlessId,
        title: document.title,
      })
      .from(duplicateMember)
      .innerJoin(document, eq(duplicateMember.documentId, document.id))
      .where(and(eq(duplicateMember.groupId, groupId), eq(duplicateMember.isPrimary, false)))
      .all();

    let groupSuccess = true;

    for (const member of members) {
      try {
        await client.deleteDocument(member.paperlessId);
        deletedDocuments++;
      } catch (error) {
        groupSuccess = false;
        errors.push({
          groupId,
          documentId: member.documentId,
          paperlessId: member.paperlessId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (groupSuccess) {
      ctx.db
        .update(duplicateGroup)
        .set({ resolved: true, updatedAt: new Date().toISOString() })
        .where(eq(duplicateGroup.id, groupId))
        .run();
      resolvedGroups++;
    }
  }

  await onProgress(100, 'Batch operation complete');

  return { deletedDocuments, resolvedGroups, errors };
});
