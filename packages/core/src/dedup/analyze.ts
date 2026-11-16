/**
 * Analysis pipeline orchestrator — 10-stage deduplication engine.
 */

import { parseTagsJson } from '../queries/helpers.js';
import { selectPrimary, type PrimaryMember } from './primary.js';
import { loadSuppressedPairSet, pairDecisionKey } from './pair-decisions.js';
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
import { computeAnalysisConfigHash, saveAnalysisConfigHash } from './analysis-hash.js';
import { ALGORITHM_VERSION } from './types.js';
import { withSpan } from '../telemetry/spans.js';
import { withPyroscopeLabels } from '../telemetry/pyroscope.js';
import {
  analysisRunsTotal,
  analysisDuration,
  analysisStageDuration,
} from '../telemetry/metrics.js';
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
  return withPyroscopeLabels({ operation: 'analysis' }, async () => {
    const logger = createLogger('analysis');
    const startTime = Date.now();
    const force = options?.force ?? false;
    const onProgress = options?.onProgress;

    const result: AnalysisResult = {
      totalDocuments: 0,
      documentsAnalyzed: 0,
      documentsSkipped: 0,
      isFullRebuild: force,
      signaturesGenerated: 0,
      signaturesReused: 0,
      candidatePairsFound: 0,
      candidatePairsScored: 0,
      candidatePairsSkippedConnected: 0,
      pairsSuppressed: 0,
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

    const libraryDocs = db
      .select({
        id: document.id,
        paperlessId: document.paperlessId,
        processingStatus: document.processingStatus,
        tagsJson: document.tagsJson,
      })
      .from(document)
      .all();

    const excludedTags = new Set(config.excludedTagNames.map((name) => name.toLowerCase()));
    const excludedDocIds = new Set(
      libraryDocs
        .filter((doc) =>
          parseTagsJson(doc.tagsJson).some((tag) => excludedTags.has(tag.toLowerCase())),
        )
        .map((doc) => doc.id),
    );
    const allDocs = libraryDocs.filter((doc) => !excludedDocIds.has(doc.id));
    result.totalDocuments = libraryDocs.length;

    if (libraryDocs.length === 0) {
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
    const skippedDocIds: string[] = [...excludedDocIds];
    let skipNoContent = 0;
    let skipTooShort = 0;
    let skipShinglesFailed = 0;

    for (let i = 0; i < docsToProcess.length; i++) {
      const doc = docsToProcess[i];

      // Check if signature already exists with matching numPermutations
      if (!force) {
        const existingNumPerm = existingSignatures.get(doc.id);
        if (existingNumPerm === config.numPermutations) {
          sigReused++;
          processedDocIds.push(doc.id);
          if (i % PROGRESS_BATCH_SIZE === 0) {
            const sigPhase = i / docsToProcess.length;
            await onProgress?.(
              0.05 + 0.35 * sigPhase,
              `Processing signatures: ${i}/${docsToProcess.length}`,
              sigPhase,
            );
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
        skippedDocIds.push(doc.id);
        skipNoContent++;
        continue;
      }

      if ((content.wordCount ?? 0) < config.minWords) {
        skippedDocIds.push(doc.id);
        skipTooShort++;
        continue;
      }

      const shingles = textToShingles(content.normalizedText, config.ngramSize, config.minWords);
      if (!shingles) {
        skippedDocIds.push(doc.id);
        skipShinglesFailed++;
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
        const sigPhase = i / docsToProcess.length;
        await onProgress?.(
          0.05 + 0.35 * sigPhase,
          `Processing signatures: ${i}/${docsToProcess.length}`,
          sigPhase,
        );
      }
    }

    result.signaturesGenerated = sigGenerated;
    result.signaturesReused = sigReused;
    result.documentsAnalyzed = processedDocIds.length;
    result.documentsSkipped = skippedDocIds.length;
    result.skipReasons = {
      excludedByTag: excludedDocIds.size,
      noContent: skipNoContent,
      tooShort: skipTooShort,
      shinglesFailed: skipShinglesFailed,
    };

    logger.info(
      { generated: sigGenerated, reused: sigReused, skipped: skippedDocIds.length },
      'Signatures processed',
    );
    await onProgress?.(0.4, `Signatures: ${sigGenerated} generated, ${sigReused} reused`);

    // Stage 4: Build LSH index from ALL signatures
    await onProgress?.(0.4, 'Building LSH index...');

    const { lshIndex, signatureMap } = await withSpan(
      'dedupe.analysis.build_lsh_index',
      {},
      async (span) => {
        const allSignatureRows = db
          .select({
            documentId: documentSignature.documentId,
            minhashSignature: documentSignature.minhashSignature,
          })
          .from(documentSignature)
          .where(eq(documentSignature.numPermutations, config.numPermutations))
          .all();

        const idx = new LSHIndex(config.numPermutations, config.numBands);
        const sigMap = new Map<string, Uint32Array>();

        for (const row of allSignatureRows) {
          if (!row.minhashSignature || excludedDocIds.has(row.documentId)) continue;
          const sig = new Uint32Array(
            row.minhashSignature.buffer.slice(
              row.minhashSignature.byteOffset,
              row.minhashSignature.byteOffset + row.minhashSignature.byteLength,
            ),
          );
          idx.insert(row.documentId, sig);
          sigMap.set(row.documentId, sig);
        }

        span.setAttribute('index.size', sigMap.size);
        return { lshIndex: idx, signatureMap: sigMap };
      },
    );

    logger.info({ indexedSignatures: signatureMap.size }, 'LSH index built');
    await onProgress?.(0.5, `LSH index built with ${signatureMap.size} signatures`);

    // Load existing groups to match by member set
    const existingGroups = db.select().from(duplicateGroup).all();

    const existingGroupMembers = new Map<
      string,
      { groupId: string; memberIds: Set<string>; status: string }
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
        status: group.status,
      });
    }

    const pendingGroupsByDoc = new Map<string, Set<string>[]>();
    for (const group of existingGroupMembers.values()) {
      if (group.status !== 'pending') continue;
      for (const id of group.memberIds) {
        const groups = pendingGroupsByDoc.get(id) ?? [];
        groups.push(group.memberIds);
        pendingGroupsByDoc.set(id, groups);
      }
    }

    // Stage 5: Find candidate pairs
    await onProgress?.(0.5, 'Finding candidate pairs...');

    let searchDocIds = force
      ? [...allDocIds]
      : processedDocIds.filter((id) => docsToProcessIds.has(id));

    let candidatePairCount = 0;
    const filteredPairs: { docId1: string; docId2: string; jaccard: number }[] = [];
    const jaccardPreFilter = config.similarityThreshold * 0.8;
    const searchedDocIds = new Set<string>();

    const scope = new Set(searchDocIds);
    const queue = [...searchDocIds];
    const expandPendingGroups = (docId: string) => {
      if (force) return;
      for (const members of pendingGroupsByDoc.get(docId) ?? []) {
        for (const memberId of members) {
          if (!scope.has(memberId)) {
            scope.add(memberId);
            queue.push(memberId);
          }
        }
      }
    };

    for (let i = 0; i < queue.length; i++) {
      const docId = queue[i];
      expandPendingGroups(docId);
      const sig = signatureMap.get(docId);
      if (!sig) continue;
      searchedDocIds.add(docId);

      const candidates = lshIndex.getCandidates(sig);
      candidates.delete(docId); // Remove self

      for (const candidateId of candidates) {
        // The queue can grow as pending groups are discovered. A previously searched
        // document has already handled this unordered pair, regardless of ID order.
        if (searchedDocIds.has(candidateId)) continue;
        const candidateSig = signatureMap.get(candidateId);
        if (!candidateSig) continue;
        candidatePairCount++;
        const jaccard = MinHash.jaccardFromArrays(sig, candidateSig);
        if (jaccard >= jaccardPreFilter) {
          const [id1, id2] = docId < candidateId ? [docId, candidateId] : [candidateId, docId];
          filteredPairs.push({ docId1: id1, docId2: id2, jaccard });
          expandPendingGroups(candidateId);
        }
      }
    }

    searchDocIds = [...scope];

    result.candidatePairsFound = candidatePairCount;
    logger.info({ candidatePairs: candidatePairCount }, 'Candidate pairs found');
    await onProgress?.(0.55, `Found ${candidatePairCount} candidate pairs`);

    // Stage 6: Score candidates
    const scoringStart = Date.now();
    await onProgress?.(0.55, 'Scoring candidate pairs...');

    const weights: SimilarityWeights = {
      jaccard: config.confidenceWeightJaccard,
      fuzzy: config.confidenceWeightFuzzy,
      discriminativePenaltyStrength: config.discriminativePenaltyStrength,
    };

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
        })
        .from(document)
        .where(inArray(document.id, batch))
        .all();

      for (const row of rows) {
        docDataMap.set(row.id, {
          id: row.id,
          title: row.title,
          normalizedText: '',
          sortedTokens: '',
        });
      }
    }

    // Load sampled text for fuzzy and discriminative scoring
    if (weights.fuzzy > 0 || weights.discriminativePenaltyStrength > 0) {
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
            data.sortedTokens = data.normalizedText.split(/\s+/).filter(Boolean).sort().join(' ');
          }
        }
      }
    }

    // Build paperlessId lookup for pair decisions and primary selection
    const paperlessIdMap = new Map<string, number>();
    for (const doc of allDocs) {
      paperlessIdMap.set(doc.id, doc.paperlessId);
    }

    const suppressedPairs = loadSuppressedPairSet(db);

    // Strongest pairs connect components first; redundant edges need no fuzzy scoring.
    filteredPairs.sort((left, right) => right.jaccard - left.jaccard);
    const uf = new UnionFind<string>();
    const scoredPairs: ScoredPair[] = [];

    for (let i = 0; i < filteredPairs.length; i++) {
      const pair = filteredPairs[i];
      const doc1 = docDataMap.get(pair.docId1);
      const doc2 = docDataMap.get(pair.docId2);

      if (!doc1 || !doc2) continue;

      if (uf.find(pair.docId1) === uf.find(pair.docId2)) {
        result.candidatePairsSkippedConnected++;
      } else {
        const similarity = computeSimilarityScore(doc1, doc2, pair.jaccard, weights, {
          fuzzySampleSize: config.fuzzySampleSize,
        });

        if (similarity.overall >= config.similarityThreshold) {
          const key = pairDecisionKey(
            paperlessIdMap.get(pair.docId1)!,
            paperlessIdMap.get(pair.docId2)!,
          );
          if (suppressedPairs.has(key)) result.pairsSuppressed++;
          else {
            scoredPairs.push({ docId1: pair.docId1, docId2: pair.docId2, similarity });
            uf.union(pair.docId1, pair.docId2);
          }
        }
      }

      if (i % PROGRESS_BATCH_SIZE === 0) {
        const scorePhase = i / filteredPairs.length;
        await onProgress?.(
          0.55 + 0.25 * scorePhase,
          `Scoring: ${i}/${filteredPairs.length}`,
          scorePhase,
        );
      }
    }

    result.candidatePairsScored = scoredPairs.length;
    analysisStageDuration().record((Date.now() - scoringStart) / 1000, { stage: 'scoring' });
    logger.info({ scoredPairs: scoredPairs.length }, 'Pairs scored');
    await onProgress?.(0.8, `Scored ${scoredPairs.length} pairs above threshold`);

    // Stage 7: Form groups via union-find
    await onProgress?.(0.8, 'Forming duplicate groups...');

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

    // Build groupId -> memberIds lookup for deletion scope check
    const existingGroupMemberIds = new Map<string, Set<string>>();
    for (const entry of existingGroupMembers.values()) {
      existingGroupMemberIds.set(entry.groupId, entry.memberIds);
    }

    // Build document -> new group members lookup for subsumption check
    const docToNewGroupMembers = new Map<string, Set<string>>();
    for (const [, members] of groupMembers) {
      for (const docId of members) {
        docToNewGroupMembers.set(docId, members);
      }
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
        let avgDiscriminative = 0;
        let avgOverall = 0;

        if (pairs.length > 0) {
          for (const pair of pairs) {
            avgJaccard += pair.similarity.jaccard;
            avgFuzzy += pair.similarity.fuzzy;
            avgDiscriminative += pair.similarity.discriminative;
            avgOverall += pair.similarity.overall;
          }
          avgJaccard /= pairs.length;
          avgFuzzy /= pairs.length;
          avgDiscriminative /= pairs.length;
          avgOverall /= pairs.length;
        }

        // Check if matches existing group by member set
        const memberKey = memberArray.sort().join('|');
        const existing = existingGroupMembers.get(memberKey);

        if (existing) {
          // Update existing group scores (preserve user-set status)
          activeExistingGroupIds.add(existing.groupId);

          tx.update(duplicateGroup)
            .set({
              confidenceScore: avgOverall,
              jaccardSimilarity: avgJaccard,
              fuzzyTextRatio: avgFuzzy,
              discriminativeScore: avgDiscriminative,
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
              discriminativeScore: avgDiscriminative,
              algorithmVersion: ALGORITHM_VERSION,
              createdAt: now,
              updatedAt: now,
            })
            .run();

          const primaryMembers: PrimaryMember[] = [];
          if (config.primaryStrategy === 'lowest_id') {
            for (const id of memberArray)
              primaryMembers.push({ id, paperlessId: paperlessIdMap.get(id)! });
          } else {
            // Load only keeper facts for new groups, with bounded SQLite parameter counts.
            for (let offset = 0; offset < memberArray.length; offset += 500) {
              primaryMembers.push(
                ...tx
                  .select({
                    id: document.id,
                    paperlessId: document.paperlessId,
                    addedDate: document.addedDate,
                    correspondent: document.correspondent,
                    documentType: document.documentType,
                    tagsJson: document.tagsJson,
                    customFieldsJson: document.customFieldsJson,
                    wordCount: documentContent.wordCount,
                  })
                  .from(document)
                  .leftJoin(documentContent, eq(documentContent.documentId, document.id))
                  .where(inArray(document.id, memberArray.slice(offset, offset + 500)))
                  .all(),
              );
            }
          }
          const { documentId: primaryId } = selectPrimary(primaryMembers, config.primaryStrategy);

          for (const documentId of memberArray) {
            tx.insert(duplicateMember)
              .values({
                groupId,
                documentId,
                isPrimary: documentId === primaryId,
              })
              .run();
          }

          result.groupsCreated++;
        }
      }

      // Delete stale groups that are still pending (preserve user-actioned groups).
      // Two deletion criteria:
      // 1. Subsumed: all members appear in a newly-formed expanded group
      // 2. Stale: at least one member was in the search scope but group wasn't re-detected
      const searchDocIdSet = new Set(searchDocIds);
      for (const group of existingGroups) {
        if (activeExistingGroupIds.has(group.id)) continue;
        if (group.status !== 'pending') continue;

        const memberIds = existingGroupMemberIds.get(group.id);
        if (!memberIds || memberIds.size === 0) continue;

        // Check if subsumed by a newly-formed group (all members in same new group)
        const firstMember = [...memberIds][0];
        const newGroupMembers = docToNewGroupMembers.get(firstMember);
        const isSubsumed = newGroupMembers && [...memberIds].every((id) => newGroupMembers.has(id));

        if (!isSubsumed) {
          // Not subsumed — only delete if at least one member was in search scope
          const wasEvaluated = [...memberIds].some(
            (id) => searchDocIdSet.has(id) || excludedDocIds.has(id),
          );
          if (!wasEvaluated) continue;
        }

        tx.delete(duplicateMember).where(eq(duplicateMember.groupId, group.id)).run();
        tx.delete(duplicateGroup).where(eq(duplicateGroup.id, group.id)).run();

        result.groupsRemoved++;
      }
    });

    logger.info(
      {
        created: result.groupsCreated,
        updated: result.groupsUpdated,
        removed: result.groupsRemoved,
      },
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

    // Mark evaluated documents complete, including tag exclusions and insufficient content.
    for (let i = 0; i < skippedDocIds.length; i += SQL_VARIABLE_LIMIT) {
      const batch = skippedDocIds.slice(i, i + SQL_VARIABLE_LIMIT);
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

    // Persist config hash so stale-analysis detection works on next page load
    saveAnalysisConfigHash(db, computeAnalysisConfigHash(config));

    // Stage 10: Return result
    result.durationMs = Date.now() - startTime;
    await onProgress?.(1.0, `Analysis complete: ${result.groupsCreated} new groups found`);

    logger.info({ ...result }, 'Analysis complete');

    // Record OTEL metrics
    const outcome = result.durationMs > 0 ? 'success' : 'failure';
    analysisRunsTotal().add(1, { outcome });
    analysisDuration().record(result.durationMs / 1000);

    return result;
  });
}
