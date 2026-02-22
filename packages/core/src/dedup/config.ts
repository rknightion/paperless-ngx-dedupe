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
  });

  return validated;
}

export function recalculateConfidenceScores(db: AppDatabase, config: DedupConfig): number {
  const groups = db.select().from(duplicateGroup).all();

  if (groups.length === 0) return 0;

  const weights = {
    jaccard: config.confidenceWeightJaccard,
    fuzzy: config.confidenceWeightFuzzy,
  };

  let updatedCount = 0;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const group of groups) {
      let weightedSum = 0;
      let activeWeightSum = 0;

      const components: { score: number | null; weight: number }[] = [
        { score: group.jaccardSimilarity, weight: weights.jaccard },
        { score: group.fuzzyTextRatio, weight: weights.fuzzy },
      ];

      for (const { score, weight } of components) {
        if (weight > 0 && score !== null) {
          weightedSum += score * weight;
          activeWeightSum += weight;
        }
      }

      const confidenceScore = activeWeightSum > 0 ? weightedSum / activeWeightSum : 0;

      tx.update(duplicateGroup)
        .set({ confidenceScore, updatedAt: now })
        .where(eq(duplicateGroup.id, group.id))
        .run();

      updatedCount++;
    }
  });

  return updatedCount;
}
