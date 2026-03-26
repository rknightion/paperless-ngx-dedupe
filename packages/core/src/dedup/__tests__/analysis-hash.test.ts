import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { syncState } from '../../schema/sqlite/app.js';
import { DEFAULT_DEDUP_CONFIG } from '../types.js';
import { setDedupConfig } from '../config.js';
import {
  computeAnalysisConfigHash,
  saveAnalysisConfigHash,
  getLastAnalysisConfigHash,
  checkAnalysisStaleness,
} from '../analysis-hash.js';

let db: AppDatabase;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  await migrateDatabase(handle.sqlite);
});

describe('computeAnalysisConfigHash', () => {
  it('should produce the same hash for the same config (deterministic)', () => {
    const hash1 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    const hash2 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    expect(hash1).toBe(hash2);
  });

  it('should produce a 64-char hex string (SHA-256)', () => {
    const hash = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hash when analysis-affecting field changes', () => {
    const hash1 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    const hash2 = computeAnalysisConfigHash({ ...DEFAULT_DEDUP_CONFIG, numBands: 64 });
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash when similarityThreshold changes', () => {
    const hash1 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    const hash2 = computeAnalysisConfigHash({ ...DEFAULT_DEDUP_CONFIG, similarityThreshold: 0.5 });
    expect(hash1).not.toBe(hash2);
  });

  it('should produce same hash when only weights change (not analysis-affecting)', () => {
    const hash1 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    const hash2 = computeAnalysisConfigHash({
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 55,
      confidenceWeightFuzzy: 45,
      discriminativePenaltyStrength: 80,
    });
    expect(hash1).toBe(hash2);
  });

  it('should produce same hash when autoAnalyze changes (not analysis-affecting)', () => {
    const hash1 = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    const hash2 = computeAnalysisConfigHash({ ...DEFAULT_DEDUP_CONFIG, autoAnalyze: false });
    expect(hash1).toBe(hash2);
  });
});

describe('saveAnalysisConfigHash / getLastAnalysisConfigHash', () => {
  it('should return null when no hash has been saved', () => {
    const hash = getLastAnalysisConfigHash(db);
    expect(hash).toBeNull();
  });

  it('should round-trip: save then read returns same hash', () => {
    saveAnalysisConfigHash(db, 'abc123');
    expect(getLastAnalysisConfigHash(db)).toBe('abc123');
  });

  it('should overwrite previous hash on subsequent save', () => {
    saveAnalysisConfigHash(db, 'first');
    saveAnalysisConfigHash(db, 'second');
    expect(getLastAnalysisConfigHash(db)).toBe('second');
  });
});

describe('checkAnalysisStaleness', () => {
  it('should return not stale on fresh DB (no prior analysis)', () => {
    const result = checkAnalysisStaleness(db);
    expect(result.isStale).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('should return not stale when hash matches current config', () => {
    const hash = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    saveAnalysisConfigHash(db, hash);
    const result = checkAnalysisStaleness(db);
    expect(result.isStale).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('should return stale when config changes after hash was saved', () => {
    const hash = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    saveAnalysisConfigHash(db, hash);

    // Change an analysis-affecting field
    setDedupConfig(db, { numBands: 64 });

    const result = checkAnalysisStaleness(db);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('config_changed');
  });

  it('should return not stale when only weights change (not analysis-affecting)', () => {
    const hash = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    saveAnalysisConfigHash(db, hash);

    // Change only weights — not analysis-affecting
    setDedupConfig(db, {
      confidenceWeightJaccard: 55,
      confidenceWeightFuzzy: 45,
      discriminativePenaltyStrength: 80,
    });

    const result = checkAnalysisStaleness(db);
    expect(result.isStale).toBe(false);
  });

  it('should return stale when no hash exists but analysis has run before (upgrade path)', () => {
    // Simulate: prior analysis ran but no hash was stored (pre-feature DB)
    db.insert(syncState)
      .values({
        id: 'singleton',
        lastAnalysisAt: new Date().toISOString(),
        totalDuplicateGroups: 5,
      })
      .run();

    const result = checkAnalysisStaleness(db);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('config_changed');
  });

  it('should include currentHash and lastHash in the result', () => {
    const hash = computeAnalysisConfigHash(DEFAULT_DEDUP_CONFIG);
    saveAnalysisConfigHash(db, hash);

    const result = checkAnalysisStaleness(db);
    expect(result.currentHash).toBe(hash);
    expect(result.lastHash).toBe(hash);
  });
});
