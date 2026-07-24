import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ConfigValidationError, coerceConfigBatch, getConfigMetadata } from '../config/registry.js';
import type { AppDatabase } from '../db/client.js';
import { getDedupConfig } from '../dedup/config.js';
import { dedupConfigSchema } from '../dedup/types.js';
import { getConfig } from '../queries/config.js';
import { appConfig } from '../schema/sqlite/app.js';
import { automationSchedule } from '../schema/sqlite/automation.js';
import { nextOccurrence } from '../scheduler/occurrences.js';
import { scheduleCadenceSchema } from '../scheduler/settings.js';
import type { ScheduleCadence } from '../scheduler/types.js';
import type { ConfigBackup } from './types.js';

const RETIRED_AI_KEYS = [
  'ai.autoApplyEnabled',
  'ai.autoApplyRequireAllAboveThreshold',
  'ai.autoApplyRequireNoClearing',
  'ai.autoApplyRequireNoNewEntities',
  'ai.autoApplyRequireOcrText',
  'ai.neverAutoCreateEntities',
  'ai.neverOverwriteNonEmpty',
  'ai.tagsOnlyAutoApply',
] as const;

const LEGACY_DROPPED_KEYS = new Set([
  ...RETIRED_AI_KEYS,
  'AI_OPENAI_API_KEY',
  'DATABASE_PATH',
  'DATABASE_URL',
  'PAPERLESS_API_TOKEN',
  'PAPERLESS_PASSWORD',
  'PAPERLESS_URL',
  'PAPERLESS_USERNAME',
  'accessToken',
  'access_token',
  'api_token',
  'clientSecret',
  'clientSecretKey',
  'database-password',
  'database.path',
  'database.url',
  'databasePassword',
  'databasePath',
  'databaseUrl',
  'database_path',
  'database_url',
  'openai.apiKey',
  'openai-api-key',
  'openaiApiKey',
  'openai_api_key',
  'paperless-api-token',
  'paperless-url',
  'paperless.apiToken',
  'paperless.password',
  'paperless.url',
  'paperless.username',
  'paperlessApiToken',
  'paperlessPassword',
  'paperlessUrl',
  'paperlessUsername',
  'paperless_api_token',
  'paperless_password',
  'paperless_url',
  'paperless_username',
  'privateKey',
  'schema_ddl_hash',
  'schema_ddl_snapshot',
  'secretKey',
]);

const DEDUP_IMPORT_KEYS = new Set([
  ...Object.keys(dedupConfigSchema.parse({})),
  'confidenceWeightDiscriminative',
]);
const SAFE_IMPORT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Migrate a raw dedup config object from older formats before Zod validation.
 * Mirrors the migration logic in getDedupConfig for DB rows.
 */
function migrateDedupConfigForImport(rawValue: Record<string, unknown>): Record<string, unknown> {
  const raw = { ...rawValue };
  if ('confidenceWeightDiscriminative' in raw && !('discriminativePenaltyStrength' in raw)) {
    const j = (raw.confidenceWeightJaccard as number) ?? 0;
    const f = (raw.confidenceWeightFuzzy as number) ?? 0;
    const d = (raw.confidenceWeightDiscriminative as number) ?? 0;

    raw.discriminativePenaltyStrength = Math.min(100, Math.round((d / 15) * 70));
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
  return raw;
}

const configBackupSchema = z
  .object({
    version: z.string().refine((value) => value.startsWith('1.'), {
      error: 'Unsupported backup version',
    }),
    exportedAt: z.string(),
    appConfig: z.record(z.string(), z.unknown()),
    dedupConfig: z.preprocess(
      (value) =>
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? migrateDedupConfigForImport(value as Record<string, unknown>)
          : value,
      dedupConfigSchema,
    ),
  })
  .strict();

export interface ConfigImportPreview {
  appConfig: Record<string, string>;
  deprecatedKeys: {
    key: 'ai.autoProcess';
    action: 'scheduled_ai_opt_in';
    requiresConfirmation: true;
  }[];
  droppedKeys: string[];
  scheduledAiOptIn: {
    requested: boolean;
    requiresConfirmation: boolean;
  };
}

export interface ConfigImportOptions {
  confirmScheduledAiOptIn?: boolean;
}

export interface ConfigImportResult {
  appConfigKeys: number;
  dedupConfigUpdated: boolean;
  deprecatedKeys: ConfigImportPreview['deprecatedKeys'];
  droppedKeys: string[];
  scheduledAiOptIn: {
    requested: boolean;
    applied: boolean;
    reason: 'not_requested' | 'confirmation_required' | 'schedule_not_configured' | 'confirmed';
  };
}

function parseImport(data: unknown) {
  // Inspect original own keys before Zod clones the record. In particular,
  // schema libraries may intentionally discard `__proto__`; silently dropping
  // it would make the import preview an unreliable pollution defence.
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const rawAppConfig = Object.getOwnPropertyDescriptor(data, 'appConfig')?.value;
    if (typeof rawAppConfig === 'object' && rawAppConfig !== null && !Array.isArray(rawAppConfig)) {
      for (const key of Object.keys(rawAppConfig)) {
        if (key === 'ai.autoProcess' || LEGACY_DROPPED_KEYS.has(key)) continue;
        if (key.startsWith('dedup.')) {
          throw new ConfigValidationError(
            key,
            'invalid_key',
            'Deduplication settings must use dedupConfig only',
          );
        }
        const value = Object.getOwnPropertyDescriptor(rawAppConfig, key)?.value;
        coerceConfigBatch({ [key]: value });
      }
    }
    const rawDedupConfig = Object.getOwnPropertyDescriptor(data, 'dedupConfig')?.value;
    if (
      typeof rawDedupConfig === 'object' &&
      rawDedupConfig !== null &&
      !Array.isArray(rawDedupConfig)
    ) {
      for (const key of Object.keys(rawDedupConfig)) {
        if (!SAFE_IMPORT_KEY_PATTERN.test(key) || !DEDUP_IMPORT_KEYS.has(key)) {
          throw new ConfigValidationError(key, 'unknown_key', `Unknown dedupConfig key "${key}"`);
        }
      }
    }
  }
  const validated = configBackupSchema.parse(data);
  const mutable: Record<string, unknown> = {};
  const droppedKeys: string[] = [];
  let autoProcessPresent = false;
  let autoProcessRequested = false;

  for (const key of Object.keys(validated.appConfig).sort()) {
    if (key === 'ai.autoProcess') {
      autoProcessPresent = true;
      const value = validated.appConfig[key];
      if (value !== true && value !== false && value !== 'true' && value !== 'false') {
        // Reuse the registry's strict boolean validation and error shape.
        coerceConfigBatch({ 'ai.extractCustomFields': value });
      }
      autoProcessRequested = value === true || value === 'true';
      continue;
    }
    if (LEGACY_DROPPED_KEYS.has(key)) {
      droppedKeys.push(key);
      continue;
    }
    mutable[key] = validated.appConfig[key];
  }

  const coerced = coerceConfigBatch(mutable);
  const deprecatedKeys: ConfigImportPreview['deprecatedKeys'] = autoProcessPresent
    ? [
        {
          key: 'ai.autoProcess',
          action: 'scheduled_ai_opt_in',
          requiresConfirmation: true,
        },
      ]
    : [];

  return {
    validated,
    preview: {
      appConfig: coerced,
      deprecatedKeys,
      droppedKeys,
      scheduledAiOptIn: {
        requested: autoProcessRequested,
        requiresConfirmation: autoProcessRequested,
      },
    } satisfies ConfigImportPreview,
  };
}

export function previewConfigImport(data: unknown): ConfigImportPreview {
  return parseImport(data).preview;
}

export function exportConfig(db: AppDatabase): ConfigBackup {
  const allConfig = getConfig(db);
  const exportableKeys = new Set(
    getConfigMetadata()
      .filter(
        (entry) =>
          entry.source === 'database' &&
          entry.section !== 'deduplication' &&
          !entry.readOnly &&
          !entry.sensitive,
      )
      .map((entry) => entry.key),
  );
  const appConfigFiltered = Object.fromEntries(
    Object.entries(allConfig)
      .filter(([key]) => exportableKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appConfig: appConfigFiltered,
    dedupConfig: getDedupConfig(db),
  };
}

export function importConfig(
  db: AppDatabase,
  data: unknown,
  options: ConfigImportOptions = {},
): ConfigImportResult {
  // All parsing, coercion, and cross-field validation happens before the
  // transaction, so malformed final entries cannot partially update the DB.
  const { validated, preview } = parseImport(data);
  const now = new Date();
  const nowIso = now.toISOString();
  let scheduledAiApplied = false;
  let scheduleSnapshot: typeof automationSchedule.$inferSelect | undefined;
  let budgetSnapshot = Number.NaN;
  let documentCapSnapshot = Number.NaN;
  let cadenceSnapshot: ScheduleCadence | null = null;
  if (preview.scheduledAiOptIn.requested && options.confirmScheduledAiOptIn === true) {
    scheduleSnapshot = db
      .select()
      .from(automationSchedule)
      .where(eq(automationSchedule.task, 'ai_processing'))
      .get();
    budgetSnapshot = Number(
      db
        .select({ value: appConfig.value })
        .from(appConfig)
        .where(eq(appConfig.key, 'automation.aiMonthlyBudgetUsd'))
        .get()?.value,
    );
    documentCapSnapshot = Number(
      db
        .select({ value: appConfig.value })
        .from(appConfig)
        .where(eq(appConfig.key, 'automation.aiMaxDocumentsPerRun'))
        .get()?.value,
    );
    cadenceSnapshot = scheduleSnapshot
      ? (scheduleCadenceSchema.parse(JSON.parse(scheduleSnapshot.cadenceJson)) as ScheduleCadence)
      : null;
  }
  const scheduleConfigured =
    scheduleSnapshot !== undefined &&
    cadenceSnapshot !== null &&
    cadenceSnapshot.kind !== 'manual' &&
    Number.isFinite(budgetSnapshot) &&
    budgetSnapshot > 0 &&
    Number.isInteger(documentCapSnapshot) &&
    documentCapSnapshot >= 1;

  db.transaction((tx) => {
    for (const [key, value] of Object.entries(preview.appConfig)) {
      tx.insert(appConfig)
        .values({ key, value, updatedAt: nowIso })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: { value, updatedAt: nowIso },
        })
        .run();
    }

    for (const [shortKey, value] of Object.entries(validated.dedupConfig)) {
      const key = `dedup.${shortKey}`;
      tx.insert(appConfig)
        .values({ key, value: String(value), updatedAt: nowIso })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: { value: String(value), updatedAt: nowIso },
        })
        .run();
    }

    // Retired mutation behavior stays retired even if stale rows predate this
    // import. This deletion is narrow and idempotent.
    for (const key of RETIRED_AI_KEYS) {
      tx.delete(appConfig).where(eq(appConfig.key, key)).run();
    }
    tx.delete(appConfig).where(eq(appConfig.key, 'ai.autoProcess')).run();

    if (
      preview.scheduledAiOptIn.requested &&
      options.confirmScheduledAiOptIn === true &&
      scheduleConfigured &&
      scheduleSnapshot &&
      cadenceSnapshot
    ) {
      const nextDueAt =
        nextOccurrence(
          {
            id: scheduleSnapshot.id,
            task: 'ai_processing',
            enabled: true,
            cadence: cadenceSnapshot,
            timezone: scheduleSnapshot.timezone,
            nextDueAt: null,
            lastClaimedDueAt: null,
          },
          now,
        )?.toISOString() ?? null;
      tx.update(automationSchedule)
        .set({
          enabled: true,
          nextDueAt,
          lastClaimedDueAt: null,
          updatedAt: nowIso,
        })
        .where(eq(automationSchedule.id, scheduleSnapshot.id))
        .run();
      scheduledAiApplied = true;
    }
  });

  let reason: ConfigImportResult['scheduledAiOptIn']['reason'];
  if (!preview.scheduledAiOptIn.requested) reason = 'not_requested';
  else if (options.confirmScheduledAiOptIn !== true) reason = 'confirmation_required';
  else if (!scheduleConfigured) reason = 'schedule_not_configured';
  else reason = 'confirmed';

  return {
    appConfigKeys: Object.keys(preview.appConfig).length,
    dedupConfigUpdated: true,
    deprecatedKeys: preview.deprecatedKeys,
    droppedKeys: preview.droppedKeys,
    scheduledAiOptIn: {
      requested: preview.scheduledAiOptIn.requested,
      applied: scheduledAiApplied,
      reason,
    },
  };
}
