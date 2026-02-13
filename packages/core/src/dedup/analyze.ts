/**
 * Analysis pipeline orchestrator — 10-stage deduplication engine.
 */

import { eq, inArray, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { syncState } from '../schema/sqlite/app.js';
import { createLogger } from '../logger.js';
import { textToShingles } from './shingles.js';
import { MinHash } from './minhash.js';
import { LSHIndex } from './lsh.js';
import { computeSimilarityScore } from './scoring.js';
import { sampleText } from './fuzzy.js';
import { UnionFind } from './union-find.js';
import { getDedupConfig } from './config.js';
import { ALGORITHM_VERSION } from './types.js';
import type { AppDatabase } from '../db/client.js';
import type {
  AnalysisOptions,
  AnalysisResult,
  ScoredPair,
  SimilarityWeights,
  DocumentScoringData,
} from './types.js';

const PROGRESS_BATCH_SIZE = 50;
const SQL_VARIABLE_LIMIT = 500;

export async function runAnalysis(
  db: AppDatabase,
  options?: AnalysisOptions,
): Promise<AnalysisResult> {
  const logger = createLogger('analysis');
  const startTime = Date.now();
  const force = options?.force ?? false;
  const onProgress = options?.onProgress;

  const result: AnalysisResult = {
    totalDocuments: 0,
    documentsAnalyzed: 0,
    signaturesGenerated: 0,
    signaturesReused: 0,
    candidatePairsFound: 0,
    candidatePairsScored: 0,
    groupsCreated: 0,
    groupsUpdated: 0,
    groupsRemoved: 0,
    durationMs: 0,
  };

  // Stage 1: Load config
  await onProgress?.(0.0, 'Loading configuration...');
  const config = getDedupConfig(db);
  logger.info({ config, force }, 'Analysis started');

  // Stage 2: Load documents
  await onProgress?.(0.02, 'Loading documents...');

  const allDocs = db
    .select({
      id: document.id,
      paperlessId: document.paperlessId,
      processingStatus: document.processingStatus,
    })
    .from(document)
    .all();

  result.totalDocuments = allDocs.length;

  if (allDocs.length === 0) {
    logger.info('No documents to analyze');
    await onProgress?.(1.0, 'No documents to analyze');
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const allDocIds = new Set(allDocs.map((d) => d.id));

  // Docs to process: pending-only or all if force
  const docsToProcess = force ? allDocs : allDocs.filter((d) => d.processingStatus === 'pending');

  const docsToProcessIds = new Set(docsToProcess.map((d) => d.id));

  logger.info({ total: allDocs.length, toProcess: docsToProcess.length }, 'Documents loaded');
  await onProgress?.(
    0.05,
    `Loaded ${allDocs.length} documents, ${docsToProcess.length} to process`,
  );

  // Stage 3: Generate MinHash signatures
  let sigGenerated = 0;
  let sigReused = 0;

  // Load existing signatures for reuse check
  const existingSignatures = new Map<string, number>();
  if (!force) {
    const sigs = db
      .select({
        documentId: documentSignature.documentId,
        numPermutations: documentSignature.numPermutations,
      })
      .from(documentSignature)
      .all();
    for (const sig of sigs) {
      existingSignatures.set(sig.documentId, sig.numPermutations);
    }
  }

  const processedDocIds: string[] = [];

  for (let i = 0; i < docsToProcess.length; i++) {
    const doc = docsToProcess[i];

    // Check if signature already exists with matching numPermutations
    if (!force) {
      const existingNumPerm = existingSignatures.get(doc.id);
      if (existingNumPerm === config.numPermutations) {
        sigReused++;
        processedDocIds.push(doc.id);
        if (i % PROGRESS_BATCH_SIZE === 0) {
          const progress = 0.05 + 0.35 * (i / docsToProcess.length);
          await onProgress?.(progress, `Processing signatures: ${i}/${docsToProcess.length}`);
        }
        continue;
      }
    }

    // Load content
    const content = db
      .select({
        normalizedText: documentContent.normalizedText,
        wordCount: documentContent.wordCount,
      })
      .from(documentContent)
      .where(eq(documentContent.documentId, doc.id))
      .get();

    if (!content || !content.normalizedText) {
      continue;
    }

    if ((content.wordCount ?? 0) < config.minWords) {
      continue;
    }

    const shingles = textToShingles(content.normalizedText, config.ngramSize, config.minWords);
    if (!shingles) {
      continue;
    }

    const mh = new MinHash(config.numPermutations);
    mh.update(shingles);
    const serialized = mh.serialize();
    const now = new Date().toISOString();

    // Upsert signature
    db.insert(documentSignature)
      .values({
        documentId: doc.id,
        minhashSignature: serialized,
        algorithmVersion: ALGORITHM_VERSION,
        numPermutations: config.numPermutations,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: documentSignature.documentId,
        set: {
          minhashSignature: serialized,
          algorithmVersion: ALGORITHM_VERSION,
          numPermutations: config.numPermutations,
          createdAt: now,
        },
      })
      .run();

    sigGenerated++;
    processedDocIds.push(doc.id);

    if (i % PROGRESS_BATCH_SIZE === 0) {
      const progress = 0.05 + 0.35 * (i / docsToProcess.length);
      await onProgress?.(progress, `Processing signatures: ${i}/${docsToProcess.length}`);
    }
  }

  result.signaturesGenerated = sigGenerated;
  result.signaturesReused = sigReused;
  result.documentsAnalyzed = processedDocIds.length;

  logger.info({ generated: sigGenerated, reused: sigReused }, 'Signatures processed');
  await onProgress?.(0.4, `Signatures: ${sigGenerated} generated, ${sigReused} reused`);

  // Stage 4: Build LSH index from ALL signatures
  await onProgress?.(0.4, 'Building LSH index...');

  const allSignatureRows = db
    .select({
      documentId: documentSignature.documentId,
      minhashSignature: documentSignature.minhashSignature,
    })
    .from(documentSignature)
    .where(eq(documentSignature.numPermutations, config.numPermutations))
    .all();

  const lshIndex = new LSHIndex(config.numPermutations, config.numBands);
  const signatureMap = new Map<string, Uint32Array>();

  for (const row of allSignatureRows) {
    if (!row.minhashSignature) continue;
    const sig = new Uint32Array(
      row.minhashSignature.buffer.slice(
        row.minhashSignature.byteOffset,
        row.minhashSignature.byteOffset + row.minhashSignature.byteLength,
      ),
    );
    lshIndex.insert(row.documentId, sig);
    signatureMap.set(row.documentId, sig);
  }

  logger.info({ indexedSignatures: signatureMap.size }, 'LSH index built');
  await onProgress?.(0.5, `LSH index built with ${signatureMap.size} signatures`);

  // Stage 5: Find candidate pairs
  await onProgress?.(0.5, 'Finding candidate pairs...');

  const searchDocIds = force
    ? [...allDocIds]
    : processedDocIds.filter((id) => docsToProcessIds.has(id));

  const candidatePairs = new Map<string, { docId1: string; docId2: string; jaccard: number }>();

  for (const docId of searchDocIds) {
    const sig = signatureMap.get(docId);
    if (!sig) continue;

    const candidates = lshIndex.getCandidates(sig);
    candidates.delete(docId); // Remove self

    for (const candidateId of candidates) {
      // Canonical ordering
      const [id1, id2] = docId < candidateId ? [docId, candidateId] : [candidateId, docId];
      const pairKey = `${id1}|${id2}`;

      if (!candidatePairs.has(pairKey)) {
        const candidateSig = signatureMap.get(candidateId);
        if (!candidateSig) continue;
        const jaccard = MinHash.jaccardFromArrays(sig, candidateSig);
        candidatePairs.set(pairKey, { docId1: id1, docId2: id2, jaccard });
      }
    }
  }

  result.candidatePairsFound = candidatePairs.size;
  logger.info({ candidatePairs: candidatePairs.size }, 'Candidate pairs found');
  await onProgress?.(0.55, `Found ${candidatePairs.size} candidate pairs`);

  // Stage 6: Score candidates
  await onProgress?.(0.55, 'Scoring candidate pairs...');

  const weights: SimilarityWeights = {
    jaccard: config.confidenceWeightJaccard,
    fuzzy: config.confidenceWeightFuzzy,
    metadata: config.confidenceWeightMetadata,
    filename: config.confidenceWeightFilename,
  };

  // Pre-filter candidates by jaccard threshold
  const jaccardPreFilter = config.similarityThreshold * 0.8;
  const filteredPairs = [...candidatePairs.values()].filter((p) => p.jaccard >= jaccardPreFilter);

  // Collect all document IDs needed for scoring
  const scoringDocIds = new Set<string>();
  for (const pair of filteredPairs) {
    scoringDocIds.add(pair.docId1);
    scoringDocIds.add(pair.docId2);
  }

  // Load document metadata in batches
  const docDataMap = new Map<string, DocumentScoringData>();
  const scoringDocIdArray = [...scoringDocIds];

  for (let i = 0; i < scoringDocIdArray.length; i += SQL_VARIABLE_LIMIT) {
    const batch = scoringDocIdArray.slice(i, i + SQL_VARIABLE_LIMIT);
    const rows = db
      .select({
        id: document.id,
        title: document.title,
        correspondent: document.correspondent,
        documentType: document.documentType,
        originalFileSize: document.originalFileSize,
        createdDate: document.createdDate,
      })
      .from(document)
      .where(inArray(document.id, batch))
      .all();

    for (const row of rows) {
      docDataMap.set(row.id, {
        id: row.id,
        title: row.title,
        normalizedText: '',
        correspondent: row.correspondent,
        documentType: row.documentType,
        originalFileSize: row.originalFileSize,
        createdDate: row.createdDate,
      });
    }
  }

  // Load sampled text if fuzzy matching is weighted
  if (weights.fuzzy > 0) {
    for (let i = 0; i < scoringDocIdArray.length; i += SQL_VARIABLE_LIMIT) {
      const batch = scoringDocIdArray.slice(i, i + SQL_VARIABLE_LIMIT);
      const rows = db
        .select({
          documentId: documentContent.documentId,
          normalizedText: documentContent.normalizedText,
        })
        .from(documentContent)
        .where(inArray(documentContent.documentId, batch))
        .all();

      for (const row of rows) {
        const data = docDataMap.get(row.documentId);
        if (data && row.normalizedText) {
          data.normalizedText = sampleText(row.normalizedText, config.fuzzySampleSize);
        }
      }
    }
  }

  // Score each pair
  const scoredPairs: ScoredPair[] = [];

  for (let i = 0; i < filteredPairs.length; i++) {
    const pair = filteredPairs[i];
    const doc1 = docDataMap.get(pair.docId1);
    const doc2 = docDataMap.get(pair.docId2);

    if (!doc1 || !doc2) continue;

    const similarity = computeSimilarityScore(doc1, doc2, pair.jaccard, weights, {
      fuzzySampleSize: config.fuzzySampleSize,
    });

    if (similarity.overall >= config.similarityThreshold) {
      scoredPairs.push({
        docId1: pair.docId1,
        docId2: pair.docId2,
        similarity,
      });
    }

    if (i % PROGRESS_BATCH_SIZE === 0) {
      const progress = 0.55 + 0.25 * (i / filteredPairs.length);
      await onProgress?.(progress, `Scoring: ${i}/${filteredPairs.length}`);
    }
  }

  result.candidatePairsScored = scoredPairs.length;
  logger.info({ scoredPairs: scoredPairs.length }, 'Pairs scored');
  await onProgress?.(0.8, `Scored ${scoredPairs.length} pairs above threshold`);

  // Stage 7: Form groups via union-find
  await onProgress?.(0.8, 'Forming duplicate groups...');

  const uf = new UnionFind<string>();

  for (const pair of scoredPairs) {
    uf.union(pair.docId1, pair.docId2);
  }

  // Group scored pairs by their union-find root
  const groupedPairs = new Map<string, ScoredPair[]>();
  for (const pair of scoredPairs) {
    const root = uf.find(pair.docId1);
    if (!groupedPairs.has(root)) {
      groupedPairs.set(root, []);
    }
    groupedPairs.get(root)!.push(pair);
  }

  // Build member sets for each group
  const groupMembers = new Map<string, Set<string>>();
  for (const [root, pairs] of groupedPairs) {
    const members = new Set<string>();
    for (const pair of pairs) {
      members.add(pair.docId1);
      members.add(pair.docId2);
    }
    groupMembers.set(root, members);
  }

  logger.info({ groups: groupMembers.size }, 'Groups formed');
  await onProgress?.(0.85, `Formed ${groupMembers.size} duplicate groups`);

  // Stage 8: Write results in transaction
  await onProgress?.(0.85, 'Writing results...');

  // Build paperlessId lookup for primary selection
  const paperlessIdMap = new Map<string, number>();
  for (const doc of allDocs) {
    paperlessIdMap.set(doc.id, doc.paperlessId);
  }

  // Load existing groups to match by member set
  const existingGroups = db.select().from(duplicateGroup).all();

  const existingGroupMembers = new Map<
    string,
    { groupId: string; memberIds: Set<string>; reviewed: boolean; resolved: boolean }
  >();
  for (const group of existingGroups) {
    const members = db
      .select({ documentId: duplicateMember.documentId })
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, group.id))
      .all();
    const memberIds = new Set(members.map((m) => m.documentId));
    const memberKey = [...memberIds].sort().join('|');
    existingGroupMembers.set(memberKey, {
      groupId: group.id,
      memberIds,
      reviewed: group.reviewed ?? false,
      resolved: group.resolved ?? false,
    });
  }

  // Track which existing groups are still active
  const activeExistingGroupIds = new Set<string>();

  db.transaction((tx) => {
    const now = new Date().toISOString();

    for (const [root, members] of groupMembers) {
      const pairs = groupedPairs.get(root) ?? [];
      const memberArray = [...members];

      // Average component scores across pairs
      let avgJaccard = 0;
      let avgFuzzy = 0;
      let avgMetadata = 0;
      let avgFilename = 0;
      let avgOverall = 0;

      if (pairs.length > 0) {
        for (const pair of pairs) {
          avgJaccard += pair.similarity.jaccard;
          avgFuzzy += pair.similarity.fuzzy;
          avgMetadata += pair.similarity.metadata;
          avgFilename += pair.similarity.filename;
          avgOverall += pair.similarity.overall;
        }
        avgJaccard /= pairs.length;
        avgFuzzy /= pairs.length;
        avgMetadata /= pairs.length;
        avgFilename /= pairs.length;
        avgOverall /= pairs.length;
      }

      // Check if matches existing group by member set
      const memberKey = memberArray.sort().join('|');
      const existing = existingGroupMembers.get(memberKey);

      if (existing) {
        // Update existing group scores (preserve reviewed/resolved)
        activeExistingGroupIds.add(existing.groupId);

        tx.update(duplicateGroup)
          .set({
            confidenceScore: avgOverall,
            jaccardSimilarity: avgJaccard,
            fuzzyTextRatio: avgFuzzy,
            metadataSimilarity: avgMetadata,
            filenameSimilarity: avgFilename,
            algorithmVersion: ALGORITHM_VERSION,
            updatedAt: now,
          })
          .where(eq(duplicateGroup.id, existing.groupId))
          .run();

        result.groupsUpdated++;
      } else {
        // Create new group
        const groupId = nanoid();

        tx.insert(duplicateGroup)
          .values({
            id: groupId,
            confidenceScore: avgOverall,
            jaccardSimilarity: avgJaccard,
            fuzzyTextRatio: avgFuzzy,
            metadataSimilarity: avgMetadata,
            filenameSimilarity: avgFilename,
            algorithmVersion: ALGORITHM_VERSION,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        // Primary = lowest paperlessId
        const sortedByPaperlessId = memberArray.sort((a, b) => {
          return (paperlessIdMap.get(a) ?? Infinity) - (paperlessIdMap.get(b) ?? Infinity);
        });

        for (let i = 0; i < sortedByPaperlessId.length; i++) {
          tx.insert(duplicateMember)
            .values({
              groupId,
              documentId: sortedByPaperlessId[i],
              isPrimary: i === 0,
            })
            .run();
        }

        result.groupsCreated++;
      }
    }

    // Delete stale groups that are unreviewed AND unresolved
    for (const group of existingGroups) {
      if (activeExistingGroupIds.has(group.id)) continue;
      if (group.reviewed || group.resolved) continue;

      // Delete members first (cascade should handle, but be explicit)
      tx.delete(duplicateMember).where(eq(duplicateMember.groupId, group.id)).run();
      tx.delete(duplicateGroup).where(eq(duplicateGroup.id, group.id)).run();

      result.groupsRemoved++;
    }
  });

  logger.info(
    { created: result.groupsCreated, updated: result.groupsUpdated, removed: result.groupsRemoved },
    'Groups written',
  );
  await onProgress?.(
    0.95,
    `Groups: ${result.groupsCreated} created, ${result.groupsUpdated} updated, ${result.groupsRemoved} removed`,
  );

  // Stage 9: Update processing status and sync state
  await onProgress?.(0.95, 'Updating processing status...');

  // Update processingStatus in batches
  for (let i = 0; i < processedDocIds.length; i += SQL_VARIABLE_LIMIT) {
    const batch = processedDocIds.slice(i, i + SQL_VARIABLE_LIMIT);
    db.update(document)
      .set({ processingStatus: 'completed' })
      .where(inArray(document.id, batch))
      .run();
  }

  // Count total duplicate groups
  const groupCountResult = db.select({ value: count() }).from(duplicateGroup).get();
  const totalDuplicateGroups = groupCountResult?.value ?? 0;

  const now = new Date().toISOString();
  db.insert(syncState)
    .values({
      id: 'singleton',
      lastAnalysisAt: now,
      totalDuplicateGroups,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastAnalysisAt: now,
        totalDuplicateGroups,
      },
    })
    .run();

  // Stage 10: Return result
  result.durationMs = Date.now() - startTime;
  await onProgress?.(1.0, `Analysis complete: ${result.groupsCreated} new groups found`);

  logger.info({ ...result }, 'Analysis complete');

  return result;
}
