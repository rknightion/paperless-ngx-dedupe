import { eq, like } from 'drizzle-orm';
import { appConfig } from '../schema/sqlite/app.js';
import { duplicateGroup } from '../schema/sqlite/duplicates.js';
import type { AppDatabase } from '../db/client.js';
import { dedupConfigSchema, DEDUP_CONFIG_PREFIX } from './types.js';
import type { DedupConfig } from './types.js';

function parseConfigValue(key: string, value: string): unknown {
  const shortKey = key.replace(DEDUP_CONFIG_PREFIX, '');
  if (shortKey === 'autoAnalyze') {
    return value === 'true';
  }
  if (shortKey === 'similarityThreshold') {
    return parseFloat(value);
  }
  // All other numeric fields are integers
  const num = Number(value);
  if (!isNaN(num)) {
    return num;
  }
  return value;
}

export function getDedupConfig(db: AppDatabase): DedupConfig {
  const rows = db
    .select()
    .from(appConfig)
    .where(like(appConfig.key, `${DEDUP_CONFIG_PREFIX}%`))
    .all();

  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    const shortKey = row.key.replace(DEDUP_CONFIG_PREFIX, '');
    raw[shortKey] = parseConfigValue(row.key, row.value);
  }

  // Migrate 1.1.0 → 1.2.0: convert 3-weight system to 2-weight + penalty
  if ('confidenceWeightDiscriminative' in raw && !('discriminativePenaltyStrength' in raw)) {
    const j = raw.confidenceWeightJaccard as number;
    const f = raw.confidenceWeightFuzzy as number;
    const d = raw.confidenceWeightDiscriminative as number;

    // Convert old D weight to penalty strength (old default 15 → new default 70)
    raw.discriminativePenaltyStrength = Math.min(100, Math.round((d / 15) * 70));

    // Redistribute J+F proportionally to sum to 100
    const jfSum = j + f;
    if (jfSum > 0) {
      raw.confidenceWeightJaccard = Math.round((j / jfSum) * 100);
      raw.confidenceWeightFuzzy = 100 - Math.round((j / jfSum) * 100);
    } else {
      raw.confidenceWeightJaccard = 60;
      raw.confidenceWeightFuzzy = 40;
    }

    delete raw.confidenceWeightDiscriminative;
  }

  // Migrate pre-1.1.0: J+F already sum to 100, just add default penalty strength
  if (
    !('confidenceWeightDiscriminative' in raw) &&
    !('discriminativePenaltyStrength' in raw) &&
    'confidenceWeightJaccard' in raw
  ) {
    raw.discriminativePenaltyStrength = 70;
  }

  return dedupConfigSchema.parse(raw) as DedupConfig;
}

export function setDedupConfig(db: AppDatabase, config: Partial<DedupConfig>): DedupConfig {
  const existing = getDedupConfig(db);
  const merged = { ...existing, ...config };
  const validated = dedupConfigSchema.parse(merged) as DedupConfig;

  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const [key, value] of Object.entries(validated)) {
      const prefixedKey = `${DEDUP_CONFIG_PREFIX}${key}`;
      tx.insert(appConfig)
        .values({
          key: prefixedKey,
          value: String(value),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: String(value),
            updatedAt: now,
          },
        })
        .run();
    }
    // Clean up stale 1.1.0 key if present
    tx.delete(appConfig)
      .where(eq(appConfig.key, `${DEDUP_CONFIG_PREFIX}confidenceWeightDiscriminative`))
      .run();
  });

  return validated;
}

export function recalculateConfidenceScores(db: AppDatabase, config: DedupConfig): number {
  const groups = db.select().from(duplicateGroup).all();

  if (groups.length === 0) return 0;

  const jWeight = config.confidenceWeightJaccard;
  const fWeight = config.confidenceWeightFuzzy;
  const strength = config.discriminativePenaltyStrength / 100;

  let updatedCount = 0;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const group of groups) {
      // Compute base from J + F weighted average
      const components: { score: number | null; weight: number }[] = [
        { score: group.jaccardSimilarity, weight: jWeight },
        { score: group.fuzzyTextRatio, weight: fWeight },
      ];

      let weightedSum = 0;
      let activeWeightSum = 0;
      for (const { score, weight } of components) {
        if (weight > 0 && score !== null) {
          weightedSum += score * weight;
          activeWeightSum += weight;
        }
      }

      const base = activeWeightSum > 0 ? weightedSum / activeWeightSum : 0;

      // Apply discriminative penalty
      let confidenceScore = base;
      if (group.discriminativeScore !== null && strength > 0) {
        confidenceScore = base * (1 - strength * (1 - group.discriminativeScore));
      }

      tx.update(duplicateGroup)
        .set({ confidenceScore, updatedAt: now })
        .where(eq(duplicateGroup.id, group.id))
        .run();

      updatedCount++;
    }
  });

  return updatedCount;
}
