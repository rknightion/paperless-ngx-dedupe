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

  it('should auto-migrate pre-1.1.0 two-weight configs to include discriminative', () => {
    // Simulate a pre-1.1.0 DB that only has J and F stored
    const now = new Date().toISOString();
    db.insert(appConfig)
      .values([
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightJaccard`, value: '55', updatedAt: now },
        { key: `${DEDUP_CONFIG_PREFIX}confidenceWeightFuzzy`, value: '45', updatedAt: now },
      ])
      .run();

    const config = getDedupConfig(db);

    // Should redistribute: carve out 15 for discriminative
    expect(config.confidenceWeightDiscriminative).toBe(15);
    // J and F should be proportionally reduced (55*0.85≈47, 45*0.85≈38)
    expect(config.confidenceWeightJaccard).toBe(47);
    expect(config.confidenceWeightFuzzy).toBe(38);
    // Must still sum to 100
    expect(
      config.confidenceWeightJaccard +
        config.confidenceWeightFuzzy +
        config.confidenceWeightDiscriminative,
    ).toBe(100);
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

  it('should accept three weights that sum to 100', () => {
    const config = setDedupConfig(db, {
      confidenceWeightJaccard: 40,
      confidenceWeightFuzzy: 35,
      confidenceWeightDiscriminative: 25,
    });
    expect(config.confidenceWeightJaccard).toBe(40);
    expect(config.confidenceWeightFuzzy).toBe(35);
    expect(config.confidenceWeightDiscriminative).toBe(25);
  });

  it('should reject three weights that do not sum to 100', () => {
    expect(() =>
      setDedupConfig(db, {
        confidenceWeightJaccard: 40,
        confidenceWeightFuzzy: 35,
        confidenceWeightDiscriminative: 30,
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
      confidenceWeightFuzzy: 35,
      confidenceWeightDiscriminative: 15,
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
        algorithmVersion: '1.0.0',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const config = {
      ...DEFAULT_DEDUP_CONFIG,
      confidenceWeightJaccard: 60,
      confidenceWeightFuzzy: 40,
      confidenceWeightDiscriminative: 0,
    };

    const count = recalculateConfidenceScores(db, config);
    expect(count).toBe(1);

    // Verify the score was recalculated
    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Expected: (0.9*60 + 0.8*40) / (60+40)
    // = (54 + 32) / 100 = 86 / 100 = 0.86
    expect(group.confidenceScore).toBeCloseTo(0.86, 3);
  });

  it('should skip null component scores in weighted average', () => {
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
      confidenceWeightDiscriminative: 0,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Only jaccard is non-null: 0.9*60 / 60 = 0.9
    expect(group.confidenceScore).toBeCloseTo(0.9, 3);
  });

  it('should include discriminative score when present and weighted', () => {
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
      confidenceWeightJaccard: 40,
      confidenceWeightFuzzy: 35,
      confidenceWeightDiscriminative: 25,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // Expected: (0.9*40 + 0.8*35 + 0.3*25) / (40+35+25)
    // = (36 + 28 + 7.5) / 100 = 71.5 / 100 = 0.715
    expect(group.confidenceScore).toBeCloseTo(0.715, 3);
  });

  it('should gracefully handle null discriminative score (pre-1.1.0 groups)', () => {
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
      confidenceWeightJaccard: 40,
      confidenceWeightFuzzy: 35,
      confidenceWeightDiscriminative: 25,
    };

    recalculateConfidenceScores(db, config);

    const groups = db.select().from(duplicateGroup).all();
    const group = groups[0];
    // discriminativeScore is null, so only J+F contribute
    // Expected: (0.9*40 + 0.8*35) / (40+35) = (36 + 28) / 75 = 0.8533...
    expect(group.confidenceScore).toBeCloseTo(64 / 75, 3);
  });
});
