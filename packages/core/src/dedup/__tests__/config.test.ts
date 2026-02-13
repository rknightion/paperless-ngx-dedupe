import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getDedupConfig, setDedupConfig, recalculateConfidenceScores } from '../config.js';
import { DEFAULT_DEDUP_CONFIG } from '../types.js';
import { duplicateGroup } from '../../schema/sqlite/duplicates.js';

let db: AppDatabase;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  await migrateDatabase(handle.sqlite);
});

describe('getDedupConfig', () => {
  it('should return defaults when no config rows exist', () => {
    const config = getDedupConfig(db);
    expect(config).toEqual(DEFAULT_DEDUP_CONFIG);
  });
});

describe('setDedupConfig', () => {
  it('should write all keys with dedup. prefix', () => {
    const config = setDedupConfig(db, { numPermutations: 256 });
    expect(config.numPermutations).toBe(256);

    // Read back
    const readBack = getDedupConfig(db);
    expect(readBack.numPermutations).toBe(256);
  });

  it('should merge partial update with existing values', () => {
    setDedupConfig(db, { minWords: 50 });
    const updated = setDedupConfig(db, { ngramSize: 5 });
    expect(updated.minWords).toBe(50);
    expect(updated.ngramSize).toBe(5);
  });

  it('should reject weights that do not sum to 100', () => {
    expect(() =>
      setDedupConfig(db, {
        confidenceWeightJaccard: 50,
        confidenceWeightFuzzy: 50,
        confidenceWeightMetadata: 50,
        confidenceWeightFilename: 50,
      }),
    ).toThrow();
  });

  it('should round-trip: write then read returns same values', () => {
    const input = {
      numPermutations: 128,
      numBands: 16,
      ngramSize: 4,
      minWords: 30,
      similarityThreshold: 0.8,
      confidenceWeightJaccard: 50,
      confidenceWeightFuzzy: 20,
      confidenceWeightMetadata: 20,
      confidenceWeightFilename: 10,
      fuzzySampleSize: 3000,
      autoAnalyze: false,
    };
    setDedupConfig(db, input);
    const readBack = getDedupConfig(db);
    expect(readBack).toEqual(input);
  });

  it('should parse boolean values correctly', () => {
    setDedupConfig(db, { autoAnalyze: false });
    const config = getDedupConfig(db);
    expect(config.autoAnalyze).toBe(false);
    expect(typeof config.autoAnalyze).toBe('boolean');
  });

  it('should parse float values correctly', () => {
    setDedupConfig(db, { similarityThreshold: 0.65 });
    const config = getDedupConfig(db);
    expect(config.similarityThreshold).toBeCloseTo(0.65);
    expect(typeof config.similarityThreshold).toBe('number');
  });
});

describe('recalculateConfidenceScores', () => {
  it('should return 0 when no groups exist', () => {
    const config = getDedupConfig(db);
    const count = recalculateConfidenceScores(db, config);
    expect(count).toBe(0);
  });

  it('should update confidence scores based on weights', () => {
    const now = new Date().toISOString();

    // Insert a duplicate group with known component scores
    db.insert(duplicateGroup)
      .values({
        id: 'group-1',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: 0.8,
        metadataSimilarity: 0.6,
        filenameSimilarity: 0.7,
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 40,
      confidenceWeightFuzzy: 30,
      confidenceWeightMetadata: 15,
      confidenceWeightFilename: 15,
    };

    const count = recalculateConfidenceScores(db, config);
    expect(count).toBe(1);

    // Verify the score was recalculated
    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Expected: (0.9*40 + 0.8*30 + 0.6*15 + 0.7*15) / (40+30+15+15)
    // = (36 + 24 + 9 + 10.5) / 100 = 79.5 / 100 = 0.795
    expect(group.confidenceScore).toBeCloseTo(0.795, 3);
  });

  it('should skip null component scores in weighted average', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-2',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: null,
        metadataSimilarity: null,
        filenameSimilarity: null,
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 40,
      confidenceWeightFuzzy: 30,
      confidenceWeightMetadata: 15,
      confidenceWeightFilename: 15,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Only jaccard is non-null: 0.9*40 / 40 = 0.9
    expect(group.confidenceScore).toBeCloseTo(0.9, 3);
  });
});
