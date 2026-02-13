import { config as loadDotenv } from 'dotenv';

export function loadEnv(envFilePath: string): void {
  loadDotenv({ path: envFilePath });
}

/**
 * Build the env record for parseConfig, merging CLI flags over env vars.
 */
export function buildConfigEnv(opts: {
  db?: string;
  logLevel?: string;
}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  if (opts.db) {
    env.DATABASE_URL = opts.db;
  }
  if (opts.logLevel) {
    env.LOG_LEVEL = opts.logLevel;
  }

  return env;
}
