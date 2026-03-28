import { like } from 'drizzle-orm';
import { appConfig } from '../schema/sqlite/app.js';
import type { AppDatabase } from '../db/client.js';
import { aiConfigSchema, AI_CONFIG_PREFIX } from './types.js';
import type { AiConfig } from './types.js';

function parseConfigValue(key: string, value: string): unknown {
  const shortKey = key.replace(AI_CONFIG_PREFIX, '');
  if (
    shortKey === 'autoProcess' ||
    shortKey === 'addProcessedTag' ||
    shortKey === 'includeCorrespondents' ||
    shortKey === 'includeDocumentTypes' ||
    shortKey === 'includeTags' ||
    shortKey === 'neverAutoCreateEntities' ||
    shortKey === 'neverOverwriteNonEmpty' ||
    shortKey === 'tagsOnlyAutoApply' ||
    shortKey === 'autoApplyEnabled' ||
    shortKey === 'autoApplyRequireAllAboveThreshold' ||
    shortKey === 'autoApplyRequireNoNewEntities' ||
    shortKey === 'autoApplyRequireNoClearing' ||
    shortKey === 'autoApplyRequireOcrText' ||
    shortKey === 'protectedTagsEnabled'
  ) {
    return value === 'true';
  }
  if (shortKey === 'protectedTagNames') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  const num = Number(value);
  if (
    !isNaN(num) &&
    shortKey !== 'promptTemplate' &&
    shortKey !== 'provider' &&
    shortKey !== 'model' &&
    shortKey !== 'processedTagName' &&
    shortKey !== 'reasoningEffort'
  ) {
    return num;
  }
  return value;
}

export function getAiConfig(db: AppDatabase): AiConfig {
  const rows = db
    .select()
    .from(appConfig)
    .where(like(appConfig.key, `${AI_CONFIG_PREFIX}%`))
    .all();

  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    const shortKey = row.key.replace(AI_CONFIG_PREFIX, '');
    raw[shortKey] = parseConfigValue(row.key, row.value);
  }

  return aiConfigSchema.parse(raw) as AiConfig;
}

export function setAiConfig(db: AppDatabase, config: Partial<AiConfig>): AiConfig {
  const existing = getAiConfig(db);
  const merged = { ...existing, ...config };
  const validated = aiConfigSchema.parse(merged) as AiConfig;

  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const [key, value] of Object.entries(validated)) {
      const prefixedKey = `${AI_CONFIG_PREFIX}${key}`;
      const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
      tx.insert(appConfig)
        .values({
          key: prefixedKey,
          value: serialized,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: serialized,
            updatedAt: now,
          },
        })
        .run();
    }
  });

  return validated;
}
