import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getDedupConfig, setDedupConfig, recalculateConfidenceScores } from '../config.js';
import { DEFAULT_DEDUP_CONFIG, DEDUP_CONFIG_PREFIX } from '../types.js';
import { duplicateGroup } from '../../schema/sqlite/duplicates.js';
import { appConfig } from '../../schema/sqlite/app.js';

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

  it('should auto-migrate pre-1.1.0 two-weight configs to 2-weight + penalty', () => {
    // Simulate a pre-1.1.0 DB that only has J and F stored (summing to 100)
    const now = new Date().toISOString();
    db.insert(appConfig)
      .values([
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightJaccard`, value: '55', updatedAt: now },
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightFuzzy`, value: '45', updatedAt: now },
      ])
      .run();

    const config = getDedupConfig(db);

    // J+F should still sum to 100 (already did)
    expect(config.confidenceWeightJaccard).toBe(55);
    expect(config.confidenceWeightFuzzy).toBe(45);
    expect(config.confidenceWeightJaccard + config.confidenceWeightFuzzy).toBe(100);
    // Default penalty strength added
    expect(config.discriminativePenaltyStrength).toBe(50);
  });

  it('should migrate 1.1.0 three-weight config to 2-weight + penalty', () => {
    const now = new Date().toISOString();
    db.insert(appConfig)
      .values([
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightJaccard`, value: '50', updatedAt: now },
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightFuzzy`, value: '35', updatedAt: now },
        {
          key: `${DEDUP_CONFIG_PREFIX}confidenceWeightDiscriminative`,
          value: '15',
          updatedAt: now,
        },
      ])
      .run();

    const config = getDedupConfig(db);

    // J+F redistributed proportionally to sum to 100: 50/(50+35)*100=59, 100-59=41
    expect(config.confidenceWeightJaccard).toBe(59);
    expect(config.confidenceWeightFuzzy).toBe(41);
    expect(config.confidenceWeightJaccard + config.confidenceWeightFuzzy).toBe(100);
    // D weight 15 → penalty strength: min(100, round(15/15*50)) = 50
    expect(config.discriminativePenaltyStrength).toBe(50);
    // Old field should not exist
    expect('confidenceWeightDiscriminative' in config).toBe(false);
  });

  it('should migrate high discriminative weight to capped penalty strength', () => {
    const now = new Date().toISOString();
    db.insert(appConfig)
      .values([
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightJaccard`, value: '30', updatedAt: now },
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightFuzzy`, value: '20', updatedAt: now },
        {
          key: `${DEDUP_CONFIG_PREFIX}confidenceWeightDiscriminative`,
          value: '50',
          updatedAt: now,
        },
      ])
      .run();

    const config = getDedupConfig(db);

    // J+F redistributed: 30/50*100=60, 100-60=40
    expect(config.confidenceWeightJaccard).toBe(60);
    expect(config.confidenceWeightFuzzy).toBe(40);
    // D weight 50 → penalty strength: min(100, round(50/15*50)) = 100 (capped)
    expect(config.discriminativePenaltyStrength).toBe(100);
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
        confidenceWeightJaccard: 60,
        confidenceWeightFuzzy: 60,
      }),
    ).toThrow();
  });

  it('should accept two weights that sum to 100', () => {
    const config = setDedupConfig(db, {
      confidenceWeightJaccard: 70,
      confidenceWeightFuzzy: 30,
    });
    expect(config.confidenceWeightJaccard).toBe(70);
    expect(config.confidenceWeightFuzzy).toBe(30);
  });

  it('should accept penalty strength independently of weights', () => {
    const config = setDedupConfig(db, {
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 75,
    });
    expect(config.discriminativePenaltyStrength).toBe(75);
  });

  it('should reject two weights that do not sum to 100', () => {
    expect(() =>
      setDedupConfig(db, {
        confidenceWeightJaccard: 40,
        confidenceWeightFuzzy: 35,
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
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 75,
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

  it('should clean up stale confidenceWeightDiscriminative key', () => {
    const now = new Date().toISOString();
    // Simulate a leftover 1.1.0 key
    db.insert(appConfig)
      .values({
        key: `${DEDUP_CONFIG_PREFIX}confidenceWeightDiscriminative`,
        value: '15',
        updatedAt: now,
      })
      .run();

    setDedupConfig(db, { discriminativePenaltyStrength: 50 });

    // The old key should have been deleted
    const rows = db
      .select()
      .from(appConfig)
      .all()
      .filter((r) => r.key.includes('confidenceWeightDiscriminative'));
    expect(rows).toHaveLength(0);
  });
});

describe('recalculateConfidenceScores', () => {
  it('should return 0 when no groups exist', () => {
    const config = getDedupConfig(db);
    const count = recalculateConfidenceScores(db, config);
    expect(count).toBe(0);
  });

  it('should compute base score from J+F weighted average', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-1',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: 0.8,
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 0,
    };

    const count = recalculateConfidenceScores(db, config);
    expect(count).toBe(1);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Base: (0.9*60 + 0.8*40) / 100 = 0.86, no penalty (strength=0)
    expect(group.confidenceScore).toBeCloseTo(0.86, 3);
  });

  it('should skip null component scores in base calculation', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-2',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: null,
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 0,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Only jaccard is non-null: 0.9*60 / 60 = 0.9
    expect(group.confidenceScore).toBeCloseTo(0.9, 3);
  });

  it('should apply discriminative penalty when present', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-3',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: 0.8,
        discriminativeScore: 0.3,
        algorithmVersion: '1.1.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 50,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Base: (0.9*60 + 0.8*40) / 100 = 0.86
    // Penalty: 0.86 * (1 - 0.5 * (1 - 0.3)) = 0.86 * (1 - 0.35) = 0.86 * 0.65 = 0.559
    expect(group.confidenceScore).toBeCloseTo(0.559, 3);
  });

  it('should not penalize when discriminative score is null (pre-1.1.0 groups)', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-4',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: 0.8,
        discriminativeScore: null,
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 80,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // discriminativeScore is null, so penalty is skipped → result = base
    // Base: (0.9*60 + 0.8*40) / 100 = 0.86
    expect(group.confidenceScore).toBeCloseTo(0.86, 3);
  });

  it('should not penalize when discriminative score is 1.0', () => {
    const now = new Date().toISOString();

    db.insert(duplicateGroup)
      .values({
        id: 'group-5',
        confidenceScore: 0.5,
        jaccardSimilarity: 0.9,
        fuzzyTextRatio: 0.8,
        discriminativeScore: 1.0,
        algorithmVersion: '1.2.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      discriminativePenaltyStrength: 100,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // D=1.0 → penalty multiplier = 1 - 1.0*(1-1.0) = 1.0, no reduction
    // Base: (0.9*60 + 0.8*40) / 100 = 0.86
    expect(group.confidenceScore).toBeCloseTo(0.86, 3);
  });
});
