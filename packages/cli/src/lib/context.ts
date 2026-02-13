import {
  parseConfig,
  initLogger,
  createDatabaseWithHandle,
  migrateDatabase,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { AppConfig, AppDatabase } from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';

import { loadEnv, buildConfigEnv } from './env.js';

export interface CliContext {
  config: AppConfig;
  db: AppDatabase;
  sqlite: Database.Database;
  client: PaperlessClient;
}

export interface GlobalOpts {
  db?: string;
  envFile: string;
  logLevel?: string;
  json?: boolean;
}

/**
 * Initialize the CLI context: load env, parse config, open DB, migrate, create Paperless client.
 */
export function createCliContext(opts: GlobalOpts): CliContext {
  loadEnv(opts.envFile);

  const env = buildConfigEnv({ db: opts.db, logLevel: opts.logLevel });
  const config = parseConfig(env);

  initLogger(config.LOG_LEVEL);

  const { db, sqlite } = createDatabaseWithHandle(config.DATABASE_URL);
  migrateDatabase(sqlite);

  const client = new PaperlessClient(toPaperlessConfig(config));

  return { config, db, sqlite, client };
}

/**
 * Lighter context that only needs the database (no Paperless client).
 * Useful for commands that don't interact with the Paperless API.
 */
export function createDbContext(opts: GlobalOpts): Pick<CliContext, 'config' | 'db' | 'sqlite'> {
  loadEnv(opts.envFile);

  const env = buildConfigEnv({ db: opts.db, logLevel: opts.logLevel });

  // For DB-only commands, provide fallback values so config parsing doesn't fail
  // when PAPERLESS_URL / auth aren't set
  if (!env.PAPERLESS_URL) {
    env.PAPERLESS_URL = 'http://localhost:8000';
  }
  if (!env.PAPERLESS_API_TOKEN && !env.PAPERLESS_USERNAME) {
    env.PAPERLESS_API_TOKEN = 'placeholder';
  }

  const config = parseConfig(env);
  initLogger(config.LOG_LEVEL);

  const { db, sqlite } = createDatabaseWithHandle(config.DATABASE_URL);
  migrateDatabase(sqlite);

  return { config, db, sqlite };
}
