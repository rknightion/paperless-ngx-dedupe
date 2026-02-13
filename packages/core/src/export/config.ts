import { z } from 'zod';

import type { AppDatabase } from '../db/client.js';
import { getConfig, setConfigBatch } from '../queries/config.js';
import { getDedupConfig, setDedupConfig } from '../dedup/config.js';
import { dedupConfigSchema } from '../dedup/types.js';
import type { ConfigBackup } from './types.js';

const configBackupSchema = z.object({
  version: z.string().refine((v) => v.startsWith('1.'), {
    message: 'Unsupported backup version',
  }),
  exportedAt: z.string(),
  appConfig: z.record(z.string(), z.string()),
  dedupConfig: dedupConfigSchema,
});

function filterSchemaDdlKeys(config: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!key.startsWith('schema_ddl_')) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function exportConfig(db: AppDatabase): ConfigBackup {
  const allConfig = getConfig(db);
  const appConfigFiltered = filterSchemaDdlKeys(allConfig);
  const dedupConfig = getDedupConfig(db);

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appConfig: appConfigFiltered,
    dedupConfig,
  };
}

export function importConfig(
  db: AppDatabase,
  data: unknown,
): { appConfigKeys: number; dedupConfigUpdated: boolean } {
  const validated = configBackupSchema.parse(data);

  const filteredAppConfig = filterSchemaDdlKeys(validated.appConfig);

  setConfigBatch(db, filteredAppConfig);
  setDedupConfig(db, validated.dedupConfig);

  return {
    appConfigKeys: Object.keys(filteredAppConfig).length,
    dedupConfigUpdated: true,
  };
}
