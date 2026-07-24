import type { AppDatabase } from '../db/client.js';
import { CONFIG_REGISTRY, coerceConfigBatch } from '../config/registry.js';
import { getDedupConfig } from '../dedup/config.js';
import { dedupConfigSchema } from '../dedup/types.js';
import { appConfig } from '../schema/sqlite/app.js';

const ENVIRONMENT_OWNED_CONFIG_KEYS = new Set([
  'paperless.url',
  'paperless.apiToken',
  'paperless.username',
  'paperless.password',
  'paperlessUrl',
  'paperless-url',
  'paperless_url',
  'paperless_api_token',
  'paperless_username',
  'paperless_password',
  'PAPERLESS_URL',
  'PAPERLESS_API_TOKEN',
  'PAPERLESS_USERNAME',
  'PAPERLESS_PASSWORD',
  'database.url',
  'databaseUrl',
  'database_url',
  'database.path',
  'databasePath',
  'database_path',
  'DATABASE_URL',
  'DATABASE_PATH',
]);

const CREDENTIAL_KEY_SUFFIXES = [
  'apikey',
  'apitoken',
  'accesstoken',
  'clientsecret',
  'clientsecretkey',
  'databasepassword',
  'privatekey',
  'secretkey',
  'password',
  'secret',
  'token',
  'username',
] as const;

const MUTABLE_CONFIG_KEYS = new Set(
  CONFIG_REGISTRY.filter(
    (entry) => entry.source === 'database' && !entry.readOnly && !entry.sensitive,
  ).map((entry) => entry.key),
);

export function isEnvironmentOwnedConfigKey(key: string): boolean {
  return ENVIRONMENT_OWNED_CONFIG_KEYS.has(key);
}

export function isSensitiveConfigKey(key: string): boolean {
  if (isEnvironmentOwnedConfigKey(key)) return true;

  const normalized = key.replace(/[._-]/g, '').toLowerCase();
  return CREDENTIAL_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function filterPersistableConfig(config: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (MUTABLE_CONFIG_KEYS.has(key) && !isSensitiveConfigKey(key)) {
      result[key] = value;
    }
  }
  return result;
}

export function getConfig(db: AppDatabase): Record<string, string> {
  const rows = db.select().from(appConfig).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function redactSensitiveConfig(config: Record<string, string>): Record<string, string> {
  return filterPersistableConfig(config);
}

export function setConfig(db: AppDatabase, key: string, value: unknown): void {
  setConfigBatch(db, { [key]: value });
}

export function setConfigBatch(db: AppDatabase, settings: Record<string, unknown>): void {
  // Coerce and validate the complete input before opening the transaction. A
  // bad final key must never leave earlier keys partially applied.
  const persistableSettings = coerceConfigBatch(settings);
  if (Object.keys(persistableSettings).some((key) => key.startsWith('dedup.confidenceWeight'))) {
    const current = getDedupConfig(db);
    dedupConfigSchema.parse({
      ...current,
      ...Object.fromEntries(
        Object.entries(persistableSettings)
          .filter(
            ([key]) =>
              key === 'dedup.confidenceWeightJaccard' || key === 'dedup.confidenceWeightFuzzy',
          )
          .map(([key, value]) => [key.slice('dedup.'.length), Number(value)]),
      ),
    });
  }
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(persistableSettings)) {
      tx.insert(appConfig)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}
