import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent, documentSignature } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { eq } from 'drizzle-orm';
import { runAnalysis } from '../analyze.js';
import { setDedupConfig } from '../config.js';
import { LSHIndex } from '../lsh.js';
import { MinHash } from '../minhash.js';

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
  it('counts all template candidates without retaining below-filter pair keys', async () => {
    setDedupConfig(db, {
      numPermutations: 64,
      numBands: 64,
      similarityThreshold: 0.8,
      confidenceWeightJaccard: 100,
      confidenceWeightFuzzy: 0,
      discriminativePenaltyStrength: 0,
    });
    for (let i = 0; i < 400; i++) {
      const changed = i < 300 ? 16 : 120;
      const text = Array.from({ length: 400 }, (_, word) =>
        word < changed ? `variant${i}word${word}` : `templateword${word}`,
      ).join(' ');
      seedDocument(db, i + 1, `Template ${i}`, text);
    }
    let searching = false;
    let retainedPairKeys = 0;
    const originalSet = Map.prototype.set;
    const spy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (
      this: Map<unknown, unknown>,
      key,
      value,
    ) {
      if (searching && typeof key === 'string' && /^[A-Za-z0-9_-]+\|[A-Za-z0-9_-]+$/.test(key))
        retainedPairKeys++;
      return originalSet.call(this, key, value);
    });
    let result;
    try {
      result = await runAnalysis(db, {
        force: true,
        onProgress: async (_progress, message) => {
          if (message === 'Finding candidate pairs...') searching = true;
          if (message === 'Scoring candidate pairs...') searching = false;
        },
      });
    } finally {
      spy.mockRestore();
    }
    const index = new LSHIndex(64, 64);
    const signatures = new Map<string, Uint32Array>();
    for (const row of db.select().from(documentSignature).all()) {
      const bytes = row.minhashSignature!;
      const signature = new Uint32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      signatures.set(row.documentId, signature);
      index.insert(row.documentId, signature);
    }
    let count = 0;
    let passingFilter = 0;
    for (const [id, signature] of signatures) {
      for (const candidate of index.getCandidates(signature)) {
        if (candidate <= id) continue;
        count++;
        if (MinHash.jaccardFromArrays(signature, signatures.get(candidate)!) >= 0.8 * 0.8)
          passingFilter++;
      }
    }
    expect(passingFilter).toBeGreaterThan(0);
    expect(passingFilter).toBeLessThan(count);
    expect(result.candidatePairsFound).toBe(count);
    expect(retainedPairKeys).toBe(0);
  }, 30_000);

  it('preserves candidate counts and group scores when incremental closure expands backwards', async () => {
    const text = (offset: number) =>
      Array.from({ length: 400 }, (_, i) => `word${(i + offset).toString(36)}`).join(' ');
    const ids = [0, 40, 80].map((offset, i) =>
      seedDocument(db, i + 1, `Document ${i + 1}`, text(offset)),
    );
    const forced = await runAnalysis(db, { force: true });
    const snapshot = () =>
      db
        .select()
        .from(duplicateGroup)
        .all()
        .map((group) => ({
          members: db
            .select()
            .from(duplicateMember)
            .where(eq(duplicateMember.groupId, group.id))
            .all()
            .map((member) => member.documentId)
            .sort(),
          confidenceScore: group.confidenceScore,
          jaccardSimilarity: group.jaccardSimilarity,
          fuzzyTextRatio: group.fuzzyTextRatio,
          status: group.status,
        }));
    const expected = snapshot();
    expect(expected).toHaveLength(1);
    expect(expected[0].members).toEqual([...ids].sort());
    db.update(document)
      .set({ processingStatus: 'pending' })
      .where(eq(document.id, [...ids].sort().at(-1)!))
      .run();
    const incremental = await runAnalysis(db);
    expect(incremental.candidatePairsFound).toBe(forced.candidatePairsFound);
    expect(incremental.candidatePairsScored).toBe(forced.candidatePairsScored);
    expect(snapshot()).toEqual(expected);
    await runAnalysis(db, { force: true });
    expect(snapshot()).toEqual(expected);
  });

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

  it('keeps every member of a chained group when one member changes', async () => {
    const text = (offset: number) =>
      Array.from({ length: 400 }, (_, i) => `word${(i + offset).toString(36)}`).join(' ');
    const ids = [0, 40, 80].map((offset, i) =>
      seedDocument(db, i + 1, `Document ${i + 1}`, text(offset)),
    );
    await runAnalysis(db);
    const members = () =>
      db
        .select()
        .from(duplicateGroup)
        .all()
        .map((group) =>
          db
            .select()
            .from(duplicateMember)
            .where(eq(duplicateMember.groupId, group.id))
            .all()
            .map((member) => member.documentId)
            .sort(),
        )
        .sort();
    expect(members()).toEqual([[...ids].sort()]);
    db.update(document).set({ processingStatus: 'pending' }).where(eq(document.id, ids[2])).run();
    await runAnalysis(db);
    expect(members()).toEqual([[...ids].sort()]);
    const incremental = members();
    await runAnalysis(db, { force: true });
    expect(members()).toEqual(incremental);
  });

  it('merges a new document into an existing group instead of creating an overlapping one', async () => {
    const text = (offset: number) =>
      Array.from({ length: 400 }, (_, i) => `word${(i + offset).toString(36)}`).join(' ');
    const ids = [0, 40].map((offset, i) =>
      seedDocument(db, i + 1, `Document ${i + 1}`, text(offset)),
    );
    await runAnalysis(db);
    ids.push(seedDocument(db, 3, 'Document 3', text(80)));
    const members = () =>
      db
        .select()
        .from(duplicateGroup)
        .all()
        .map((group) =>
          db
            .select()
            .from(duplicateMember)
            .where(eq(duplicateMember.groupId, group.id))
            .all()
            .map((member) => member.documentId)
            .sort(),
        )
        .sort();
    await runAnalysis(db);
    expect(members()).toEqual([[...ids].sort()]);
    const incremental = members();
    await runAnalysis(db, { force: true });
    expect(members()).toEqual(incremental);
  });

  it.each(['false_positive', 'ignored'] as const)(
    'preserves a %s group during incremental analysis',
    async (status) => {
      const text = generateText('synthetic repeated document content for analysis', 20);
      const ids = [1, 2].map((id) => seedDocument(db, id, `Document ${id}`, text));
      await runAnalysis(db);
      const group = db.select().from(duplicateGroup).get()!;
      db.update(duplicateGroup).set({ status }).where(eq(duplicateGroup.id, group.id)).run();
      const before = db
        .select()
        .from(duplicateMember)
        .where(eq(duplicateMember.groupId, group.id))
        .all();
      db.update(document).set({ processingStatus: 'pending' }).where(eq(document.id, ids[0])).run();
      await runAnalysis(db);
      expect(
        db.select().from(duplicateGroup).where(eq(duplicateGroup.id, group.id)).get()?.status,
      ).toBe(status);
      expect(
        db.select().from(duplicateMember).where(eq(duplicateMember.groupId, group.id)).all(),
      ).toEqual(before);
    },
  );

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
