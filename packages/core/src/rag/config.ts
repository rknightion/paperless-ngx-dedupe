import { like } from 'drizzle-orm';
import { appConfig } from '../schema/sqlite/app.js';
import type { AppDatabase } from '../db/client.js';
import { ragConfigSchema, RAG_CONFIG_PREFIX } from './types.js';
import type { RagConfig } from './types.js';

const BOOLEAN_KEYS = new Set(['autoIndex']);
const STRING_KEYS = new Set(['embeddingModel', 'answerProvider', 'answerModel', 'systemPrompt']);

function parseConfigValue(key: string, value: string): unknown {
  const shortKey = key.replace(RAG_CONFIG_PREFIX, '');
  if (BOOLEAN_KEYS.has(shortKey)) {
    return value === 'true';
  }
  if (!STRING_KEYS.has(shortKey)) {
    const num = Number(value);
    if (!isNaN(num)) return num;
  }
  return value;
}

export function getRagConfig(db: AppDatabase): RagConfig {
  const rows = db
    .select()
    .from(appConfig)
    .where(like(appConfig.key, `${RAG_CONFIG_PREFIX}%`))
    .all();

  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    const shortKey = row.key.replace(RAG_CONFIG_PREFIX, '');
    raw[shortKey] = parseConfigValue(row.key, row.value);
  }

  return ragConfigSchema.parse(raw) as RagConfig;
}

export function setRagConfig(db: AppDatabase, config: Partial<RagConfig>): RagConfig {
  const existing = getRagConfig(db);
  const merged = { ...existing, ...config };
  const validated = ragConfigSchema.parse(merged) as RagConfig;

  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const [key, value] of Object.entries(validated)) {
      const prefixedKey = `${RAG_CONFIG_PREFIX}${key}`;
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
