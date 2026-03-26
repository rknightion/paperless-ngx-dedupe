/**
 * Analysis config hash — detects when dedup settings have changed since the
 * last analysis run, so the UI can prompt users to re-run with force rebuild.
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appConfig, syncState } from '../schema/sqlite/app.js';
import { getDedupConfig } from './config.js';
import { ALGORITHM_VERSION } from './types.js';
import type { AppDatabase } from '../db/client.js';
import type { DedupConfig } from './types.js';

const HASH_KEY = 'dedup.lastAnalysisConfigHash';

/**
 * Fields that affect analysis results. Changing any of these means existing
 * duplicate groups may be incomplete or inaccurate and a full rebuild is needed.
 *
 * NOT included (handled separately):
 * - confidenceWeightJaccard/Fuzzy, discriminativePenaltyStrength — recalculated live
 * - autoAnalyze — behavioral flag, doesn't affect quality
 */
const ANALYSIS_AFFECTING_FIELDS = [
  'fuzzySampleSize',
  'minWords',
  'ngramSize',
  'numBands',
  'numPermutations',
  'similarityThreshold',
] as const satisfies readonly (keyof DedupConfig)[];

export interface AnalysisStalenessInfo {
  isStale: boolean;
  reason: 'config_changed' | null;
  currentHash: string;
  lastHash: string | null;
}

/**
 * Compute a deterministic SHA-256 hash of analysis-affecting config fields
 * plus the algorithm version. The canonical string is sorted alphabetically
 * so field order doesn't matter.
 */
export function computeAnalysisConfigHash(config: DedupConfig): string {
  const parts: string[] = [`algorithmVersion=${ALGORITHM_VERSION}`];
  for (const field of ANALYSIS_AFFECTING_FIELDS) {
    parts.push(`${field}=${config[field]}`);
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/** Persist the config hash after a successful analysis run. */
export function saveAnalysisConfigHash(db: AppDatabase, hash: string): void {
  const now = new Date().toISOString();
  db.insert(appConfig)
    .values({ key: HASH_KEY, value: hash, updatedAt: now })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: hash, updatedAt: now },
    })
    .run();
}

/** Read the hash that was stored at the end of the last analysis run. */
export function getLastAnalysisConfigHash(db: AppDatabase): string | null {
  const row = db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, HASH_KEY))
    .get();
  return row?.value ?? null;
}

/**
 * Check whether the current dedup config / algorithm version differs from
 * what was used in the last analysis run.
 */
export function checkAnalysisStaleness(db: AppDatabase): AnalysisStalenessInfo {
  const config = getDedupConfig(db);
  const currentHash = computeAnalysisConfigHash(config);
  const lastHash = getLastAnalysisConfigHash(db);

  if (lastHash === null) {
    // No hash stored yet — check if analysis has ever run
    const syncRow = db.select({ lastAnalysisAt: syncState.lastAnalysisAt }).from(syncState).get();
    if (syncRow?.lastAnalysisAt) {
      // Analysis ran before hash tracking existed — treat as stale
      return { isStale: true, reason: 'config_changed', currentHash, lastHash };
    }
    // Never analyzed — nothing is stale
    return { isStale: false, reason: null, currentHash, lastHash };
  }

  if (currentHash !== lastHash) {
    return { isStale: true, reason: 'config_changed', currentHash, lastHash };
  }

  return { isStale: false, reason: null, currentHash, lastHash };
}
