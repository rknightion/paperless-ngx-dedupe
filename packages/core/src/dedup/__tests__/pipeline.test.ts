import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent, documentSignature } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { eq } from 'drizzle-orm';
import { runAnalysis } from '../analyze.js';

let db: AppDatabase;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  await migrateDatabase(handle.sqlite);
});

function seedDocument(
  db: AppDatabase,
  paperlessId: number,
  title: string,
  text: string,
  opts?: { processingStatus?: string },
): string {
  const now = new Date().toISOString();
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  const result = db
    .insert(document)
    .values({
      paperlessId,
      title,
      processingStatus: opts?.processingStatus ?? 'pending',
      syncedAt: now,
    })
    .returning({ id: document.id })
    .get();

  db.insert(documentContent)
    .values({
      documentId: result.id,
      normalizedText: text,
      wordCount: words.length,
    })
    .run();

  return result.id;
}

// Generate a long text with many words to exceed minWords threshold
function generateText(basePhrase: string, repetitions: number): string {
  const words: string[] = [];
  for (let i = 0; i < repetitions; i++) {
    words.push(`${basePhrase} section ${i}`);
  }
  return words.join(' ');
}

describe('runAnalysis pipeline', () => {
  it('should return zeroed result for empty database', async () => {
    const result = await runAnalysis(db);

    expect(result.totalDocuments).toBe(0);
    expect(result.documentsAnalyzed).toBe(0);
    expect(result.signaturesGenerated).toBe(0);
    expect(result.candidatePairsFound).toBe(0);
    expect(result.groupsCreated).toBe(0);
    expect(result.groupsUpdated).toBe(0);
    expect(result.groupsRemoved).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should skip documents with fewer than minWords words', async () => {
    // Default minWords is 20, seed a doc with only 5 words
    seedDocument(db, 1, 'Short Doc', 'only five words here total');

    const result = await runAnalysis(db);

    expect(result.totalDocuments).toBe(1);
    expect(result.signaturesGenerated).toBe(0);

    // No signatures should exist
    const sigs = db.select().from(documentSignature).all();
    expect(sigs).toHaveLength(0);
  });

  it('should detect two identical documents as duplicates', async () => {
    const text = generateText('the quick brown fox jumps over the lazy dog', 10);

    seedDocument(db, 1, 'Document A', text);
    seedDocument(db, 2, 'Document B', text);

    const result = await runAnalysis(db);

    expect(result.totalDocuments).toBe(2);
    expect(result.signaturesGenerated).toBe(2);
    expect(result.candidatePairsFound).toBeGreaterThanOrEqual(1);
    expect(result.groupsCreated).toBe(1);

    // Verify group structure
    const groups = db.select().from(duplicateGroup).all();
    expect(groups).toHaveLength(1);
    expect(groups[0].confidenceScore).toBeGreaterThan(0.5);

    const members = db.select().from(duplicateMember).all();
    expect(members).toHaveLength(2);

    // Primary should be the one with lowest paperlessId
    const primary = members.find((m) => m.isPrimary);
    expect(primary).toBeDefined();
    const primaryDoc = db.select().from(document).where(eq(document.id, primary!.documentId)).get();
    expect(primaryDoc?.paperlessId).toBe(1);
  });

  it('should detect three transitively similar documents as one group', async () => {
    // A and B are similar, B and C are similar, A and C might not directly match but should be grouped
    const baseText = generateText('invoice for services rendered payment due immediately', 10);
    const textA = baseText;
    const textB = baseText + ' additional notes for variant b';
    const textC = baseText + ' extra details for version c';

    seedDocument(db, 1, 'Invoice A', textA);
    seedDocument(db, 2, 'Invoice B', textB);
    seedDocument(db, 3, 'Invoice C', textC);

    const result = await runAnalysis(db);

    expect(result.totalDocuments).toBe(3);
    expect(result.signaturesGenerated).toBe(3);

    const groups = db.select().from(duplicateGroup).all();
    expect(groups).toHaveLength(1);

    const members = db
      .select()
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, groups[0].id))
      .all();
    expect(members).toHaveLength(3);
  });

  it('should not group very different documents', async () => {
    const textA = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    const textB = generateText(
      'quantum physics explains the fundamental nature of particles and waves',
      10,
    );

    seedDocument(db, 1, 'Fox Story', textA);
    seedDocument(db, 2, 'Physics Paper', textB);

    const result = await runAnalysis(db);

    expect(result.totalDocuments).toBe(2);
    expect(result.groupsCreated).toBe(0);

    const groups = db.select().from(duplicateGroup).all();
    expect(groups).toHaveLength(0);
  });

  it('should reuse existing signatures in incremental mode', async () => {
    const text1 = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    const text2 = generateText('the quick brown fox jumps over the lazy dog near the river', 10);

    seedDocument(db, 1, 'Doc 1', text1);
    seedDocument(db, 2, 'Doc 2', text2);

    // First run
    const result1 = await runAnalysis(db);
    expect(result1.signaturesGenerated).toBe(2);
    expect(result1.signaturesReused).toBe(0);

    // Add a new pending document
    seedDocument(
      db,
      3,
      'Doc 3',
      generateText('completely different document about space travel exploration', 10),
    );

    // Second run (incremental - only pending docs)
    const result2 = await runAnalysis(db);
    expect(result2.signaturesGenerated).toBe(1); // only the new one
    expect(result2.signaturesReused).toBe(0); // docs 1 and 2 are 'completed', not in pending set
  });

  it('should preserve existing groups during incremental analysis with new docs', async () => {
    // Set up two duplicate documents and run initial analysis
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    seedDocument(db, 1, 'Doc A', text);
    seedDocument(db, 2, 'Doc B', text);

    const result1 = await runAnalysis(db);
    expect(result1.groupsCreated).toBe(1);
    expect(result1.groupsRemoved).toBe(0);

    // Verify the group exists
    const groupsBefore = db.select().from(duplicateGroup).all();
    expect(groupsBefore).toHaveLength(1);
    expect(groupsBefore[0].status).toBe('pending');

    // Add a completely different document (not a duplicate of anything)
    seedDocument(
      db,
      3,
      'Unrelated Doc',
      generateText('quantum physics explains the fundamental nature of particles and waves', 10),
    );

    // Run incremental analysis (only the new doc is pending)
    const result2 = await runAnalysis(db);

    // The new doc should not form any groups
    expect(result2.groupsCreated).toBe(0);
    // The existing group should NOT be removed
    expect(result2.groupsRemoved).toBe(0);

    // Verify the original group is still intact
    const groupsAfter = db.select().from(duplicateGroup).all();
    expect(groupsAfter).toHaveLength(1);
    expect(groupsAfter[0].id).toBe(groupsBefore[0].id);

    // Verify members are still intact
    const members = db
      .select()
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, groupsAfter[0].id))
      .all();
    expect(members).toHaveLength(2);
  });

  it('should remove subsumed group when new doc expands it', async () => {
    // Set up two duplicate documents and run initial analysis
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    seedDocument(db, 1, 'Doc A', text);
    seedDocument(db, 2, 'Doc B', text);

    const result1 = await runAnalysis(db);
    expect(result1.groupsCreated).toBe(1);

    const groupsBefore = db.select().from(duplicateGroup).all();
    expect(groupsBefore).toHaveLength(1);

    // Add a third document that is similar to the existing pair
    seedDocument(db, 3, 'Doc C', text + ' with minor variation added');

    // Run incremental analysis
    const result2 = await runAnalysis(db);

    // The old {A, B} group should be subsumed by the new {A, B, C} group
    const groupsAfter = db.select().from(duplicateGroup).all();
    expect(groupsAfter).toHaveLength(1);

    // The new group should have 3 members
    const members = db
      .select()
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, groupsAfter[0].id))
      .all();
    expect(members).toHaveLength(3);

    // Old group should have been removed and new one created
    expect(result2.groupsRemoved).toBe(1);
    expect(result2.groupsCreated).toBe(1);
  });

  it('should still delete stale groups when their members are re-analyzed with force', async () => {
    // Set up two duplicate documents and run initial analysis
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    seedDocument(db, 1, 'Doc A', text);
    seedDocument(db, 2, 'Doc B', text);

    const result1 = await runAnalysis(db);
    expect(result1.groupsCreated).toBe(1);

    // Change doc B's content so it's no longer a duplicate
    const docB = db.select().from(document).where(eq(document.paperlessId, 2)).get()!;
    db.update(documentContent)
      .set({
        normalizedText: generateText(
          'quantum physics explains the fundamental nature of particles and waves',
          10,
        ),
        wordCount: 100,
      })
      .where(eq(documentContent.documentId, docB.id))
      .run();
    // Delete its signature so it gets regenerated with new content
    db.delete(documentSignature).where(eq(documentSignature.documentId, docB.id)).run();

    // Force re-analysis — all docs are in search scope
    const result2 = await runAnalysis(db, { force: true });

    // The old group should be removed since docs are no longer similar
    expect(result2.groupsRemoved).toBe(1);
    expect(result2.groupsCreated).toBe(0);

    const groupsAfter = db.select().from(duplicateGroup).all();
    expect(groupsAfter).toHaveLength(0);
  });

  it('should regenerate all signatures with force=true', async () => {
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);

    seedDocument(db, 1, 'Doc 1', text);
    seedDocument(db, 2, 'Doc 2', text);

    // First run
    await runAnalysis(db);

    // Force rebuild
    const result2 = await runAnalysis(db, { force: true });
    expect(result2.signaturesGenerated).toBe(2);
    expect(result2.signaturesReused).toBe(0);
  });

  it('should set primary document to the one with lowest paperlessId', async () => {
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);

    // Insert with paperlessId=5 first, then paperlessId=2
    seedDocument(db, 5, 'Doc High', text);
    seedDocument(db, 2, 'Doc Low', text);

    const result = await runAnalysis(db);
    expect(result.groupsCreated).toBe(1);

    const members = db.select().from(duplicateMember).all();
    const primary = members.find((m) => m.isPrimary);
    expect(primary).toBeDefined();

    const primaryDoc = db.select().from(document).where(eq(document.id, primary!.documentId)).get();
    expect(primaryDoc?.paperlessId).toBe(2);
  });

  it('should call progress callback with increasing values from 0 to 1', async () => {
    const text = generateText('the quick brown fox jumps over the lazy dog near the river', 10);
    seedDocument(db, 1, 'Doc 1', text);
    seedDocument(db, 2, 'Doc 2', text);

    const progressValues: number[] = [];
    await runAnalysis(db, {
      onProgress: async (progress) => {
        progressValues.push(progress);
      },
    });

    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[0]).toBeLessThanOrEqual(0.05);
    expect(progressValues[progressValues.length - 1]).toBe(1.0);

    // Values should be non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });
});
