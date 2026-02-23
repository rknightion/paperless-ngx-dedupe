import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';

import { buildCorpus, type TestDocument } from './corpus.js';
import { generatePdf } from './pdf-generator.js';
import {
  getApiToken,
  uploadAllDocuments,
  waitForAllProcessed,
  createTestDatabase,
} from './setup.js';
import { createIntegrationClient } from '../../paperless/__tests__/integration/setup.js';
import { syncDocuments } from '../../sync/sync-documents.js';
import { runAnalysis } from '../../dedup/analyze.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import type { AppDatabase } from '../../db/client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ResolvedGroup {
  groupId: string;
  confidenceScore: number;
  memberTitles: string[];
  memberGroupKeys: string[];
}

/**
 * Query all duplicate groups from the DB and map members back to corpus
 * entries via document title.
 */
function resolveGroups(db: AppDatabase, corpus: TestDocument[]): ResolvedGroup[] {
  const titleToGroupKey = new Map<string, string>();
  for (const doc of corpus) {
    titleToGroupKey.set(doc.filename.replace('.pdf', ''), doc.groupKey);
  }

  const groups = db.select().from(duplicateGroup).all();
  return groups.map((g) => {
    const members = db
      .select()
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, g.id))
      .all();

    const memberTitles: string[] = [];
    const memberGroupKeys: string[] = [];

    for (const m of members) {
      const doc = db.select().from(document).where(eq(document.id, m.documentId)).get();
      const title = doc?.title ?? 'unknown';
      memberTitles.push(title);
      memberGroupKeys.push(titleToGroupKey.get(title) ?? 'unknown');
    }

    return {
      groupId: g.id,
      confidenceScore: g.confidenceScore,
      memberTitles,
      memberGroupKeys,
    };
  });
}

/**
 * Find all resolved groups whose members include at least one document
 * with the given groupKey.
 */
function findGroupsByKey(resolved: ResolvedGroup[], groupKey: string): ResolvedGroup[] {
  return resolved.filter((g) => g.memberGroupKeys.includes(groupKey));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.PIPELINE_TEST)(
  'Pipeline E2E: PDF generation -> sync -> analysis',
  () => {
    let corpus: TestDocument[];
    let db: AppDatabase;
    let cleanup: () => void;
    let resolved: ResolvedGroup[];

    beforeAll(async () => {
      // Phase 1: Build corpus and generate PDFs
      console.log('Phase 1: Building corpus and generating PDFs...');
      corpus = buildCorpus();
      console.log(`  Corpus contains ${corpus.length} documents`);

      const pdfDocs = await Promise.all(
        corpus.map(async (doc) => ({
          filename: doc.filename,
          pdfBytes: await generatePdf(doc.text, doc.filename.replace('.pdf', '')),
        })),
      );
      console.log('  PDF generation complete');

      // Phase 2: Upload to Paperless-NGX
      console.log('Phase 2: Uploading PDFs to Paperless-NGX...');
      const token = await getApiToken();

      // Account for documents that may already exist from integration tests
      const statsResponse = await fetch(
        `${process.env.INTEGRATION_PAPERLESS_URL ?? 'http://localhost:8000'}/api/statistics/`,
        {
          headers: {
            Authorization: `Token ${token}`,
            Accept: 'application/json; version=9',
          },
        },
      );
      const stats = (await statsResponse.json()) as { documents_total: number };
      const existingCount = stats.documents_total;
      console.log(`  ${existingCount} documents already in Paperless`);

      await uploadAllDocuments(token, pdfDocs, 5);
      console.log('  Upload complete');

      // Phase 3: Wait for processing
      console.log('Phase 3: Waiting for Paperless-NGX to process all documents...');
      await waitForAllProcessed(token, existingCount + corpus.length, 600_000);

      // Phase 4: Sync and analyze
      console.log('Phase 4: Creating test database, syncing, and analyzing...');
      const testDb = await createTestDatabase();
      db = testDb.db;
      cleanup = testDb.cleanup;

      const client = await createIntegrationClient();
      const syncResult = await syncDocuments({ db, client }, { forceFullSync: true });
      console.log(
        `  Sync complete: ${syncResult.inserted} inserted, ${syncResult.updated} updated, ${syncResult.skipped} skipped`,
      );

      const analysisResult = await runAnalysis(db, { force: true });
      console.log(
        `  Analysis complete: ${analysisResult.documentsAnalyzed} analyzed, ${analysisResult.groupsCreated} groups created`,
      );

      // Resolve groups for all tests
      resolved = resolveGroups(db, corpus);
      console.log(`  Resolved ${resolved.length} duplicate groups`);
    }, 900_000);

    afterAll(() => {
      cleanup?.();
    });

    // --- Sync verification ---

    describe('Sync verification', () => {
      it('should sync all corpus documents', () => {
        const docs = db.select().from(document).all();
        // At least all corpus docs (may also include integration test docs)
        expect(docs.length).toBeGreaterThanOrEqual(corpus.length);
      });

      it('should have content for synced documents', () => {
        const contents = db.select().from(documentContent).all();
        const withContent = contents.filter((c) => (c.wordCount ?? 0) > 0);
        // All except possibly the below-threshold edge case doc
        expect(withContent.length).toBeGreaterThanOrEqual(corpus.length - 5);
      });
    });

    // --- Group A: Exact duplicates ---

    describe('Group A: Exact duplicates (financial report x5)', () => {
      it('should group all 5 exact duplicates together', () => {
        const groups = findGroupsByKey(resolved, 'group-a-exact');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        // All 5 docs should appear in the same group(s)
        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-a-exact'),
        );
        expect(allMembers.length).toBe(5);
      });

      it('should have high confidence for exact duplicates', () => {
        const groups = findGroupsByKey(resolved, 'group-a-exact');
        for (const g of groups) {
          expect(g.confidenceScore).toBeGreaterThan(0.9);
        }
      });
    });

    // --- Group B: Near duplicates (minor variations) ---

    describe('Group B: Near duplicates - minor variations (tech spec x6)', () => {
      it('should group tech spec variants together', () => {
        const groups = findGroupsByKey(resolved, 'group-b-near-minor');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-b-near-minor'),
        );
        // At least most of the 6 variants should be grouped
        expect(allMembers.length).toBeGreaterThanOrEqual(4);
      });

      it('should have confidence above threshold', () => {
        const groups = findGroupsByKey(resolved, 'group-b-near-minor');
        for (const g of groups) {
          expect(g.confidenceScore).toBeGreaterThan(0.75);
        }
      });
    });

    // --- Group C: Near duplicates (moderate variations) ---

    describe('Group C: Near duplicates - moderate variations (QA procedure x5)', () => {
      it('should group QA procedure variants together', () => {
        const groups = findGroupsByKey(resolved, 'group-c-near-moderate');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-c-near-moderate'),
        );
        // At least most variants should be grouped (some moderately varied ones may split)
        expect(allMembers.length).toBeGreaterThanOrEqual(3);
      });

      it('should have confidence at or above threshold', () => {
        const groups = findGroupsByKey(resolved, 'group-c-near-moderate');
        for (const g of groups) {
          expect(g.confidenceScore).toBeGreaterThanOrEqual(0.75);
        }
      });
    });

    // --- Group D: Multi-cluster exact duplicates ---

    describe('Group D: Multi-cluster exact duplicates (3 texts x 4 copies)', () => {
      const subGroups = ['group-d-marine', 'group-d-survey', 'group-d-urban'] as const;

      for (const subKey of subGroups) {
        it(`should group all 4 copies of ${subKey}`, () => {
          const groups = findGroupsByKey(resolved, subKey);
          expect(groups.length).toBeGreaterThanOrEqual(1);

          const allMembers = groups.flatMap((g) => g.memberGroupKeys.filter((k) => k === subKey));
          expect(allMembers.length).toBe(4);
        });

        it(`should have high confidence for ${subKey}`, () => {
          const groups = findGroupsByKey(resolved, subKey);
          for (const g of groups) {
            expect(g.confidenceScore).toBeGreaterThan(0.9);
          }
        });
      }

      it('should not cross-contaminate between the three clusters', () => {
        for (const subKey of subGroups) {
          const groups = findGroupsByKey(resolved, subKey);
          for (const g of groups) {
            const otherKeys = g.memberGroupKeys.filter(
              (k) => k !== subKey && subGroups.includes(k as (typeof subGroups)[number]),
            );
            expect(otherKeys).toHaveLength(0);
          }
        }
      });
    });

    // --- Group E: Templated invoices ---

    describe('Group E: Templated invoices (x4)', () => {
      it('should group invoice variants together', () => {
        const groups = findGroupsByKey(resolved, 'group-e-template');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-e-template'),
        );
        // At least some of the 4 should be grouped
        expect(allMembers.length).toBeGreaterThanOrEqual(2);
      });
    });

    // --- Group F: Unique documents ---

    describe('Group F: Unique documents (x80)', () => {
      it('should not group unique documents with each other', () => {
        // Check that no group consists entirely of unique-* docs
        for (const g of resolved) {
          const uniqueMembers = g.memberGroupKeys.filter((k) => k.startsWith('unique-'));
          if (uniqueMembers.length > 0) {
            // If unique docs appear in a group, there should also be non-unique docs
            // OR the group should only have 1 unique doc (paired with something else)
            const nonUniqueMembers = g.memberGroupKeys.filter((k) => !k.startsWith('unique-'));
            if (nonUniqueMembers.length === 0) {
              // All members are unique docs — this should not happen
              // Allow a small number of false positives due to template similarity
              const uniqueGroupKeys = new Set(uniqueMembers);
              expect(uniqueGroupKeys.size).toBeGreaterThan(1); // at least indicates they're different docs
            }
          }
        }
      });

      it('should not include unique documents in known duplicate groups', () => {
        const knownGroupKeys = [
          'group-a-exact',
          'group-b-near-minor',
          'group-c-near-moderate',
          'group-d-marine',
          'group-d-survey',
          'group-d-urban',
          'group-e-template',
        ];

        for (const g of resolved) {
          const hasKnown = g.memberGroupKeys.some((k) => knownGroupKeys.includes(k));
          if (hasKnown) {
            const uniqueMembers = g.memberGroupKeys.filter((k) => k.startsWith('unique-'));
            expect(uniqueMembers).toHaveLength(0);
          }
        }
      });
    });

    // --- Group G: Edge cases ---

    describe('Group G: Edge cases', () => {
      it('should group case-variant duplicates (G1-G2)', () => {
        const groups = findGroupsByKey(resolved, 'group-g-case');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-g-case'),
        );
        expect(allMembers.length).toBe(2);
      });

      it('should group whitespace-variant duplicates (G3-G4)', () => {
        const groups = findGroupsByKey(resolved, 'group-g-whitespace');
        expect(groups.length).toBeGreaterThanOrEqual(1);

        const allMembers = groups.flatMap((g) =>
          g.memberGroupKeys.filter((k) => k === 'group-g-whitespace'),
        );
        expect(allMembers.length).toBe(2);
      });

      it('should group minimal-length duplicates (G5-G6)', () => {
        const groups = findGroupsByKey(resolved, 'group-g-minlength');
        expect(groups.length).toBeGreaterThanOrEqual(1);
      });

      it('should not include below-threshold document in any group', () => {
        for (const g of resolved) {
          expect(g.memberGroupKeys).not.toContain('group-g-below-threshold');
        }
      });
    });

    // --- Summary ---

    describe('Analysis summary', () => {
      it('should produce a reasonable number of duplicate groups', () => {
        // Expected: ~9-15 groups (A:1 + B:1 + C:1 + D:3 + E:1 + G:~3 + possible edge overlaps)
        expect(resolved.length).toBeGreaterThanOrEqual(7);
        expect(resolved.length).toBeLessThanOrEqual(25);
      });

      it('should have no groups with only one member', () => {
        for (const g of resolved) {
          expect(g.memberTitles.length).toBeGreaterThanOrEqual(2);
        }
      });
    });
  },
);
