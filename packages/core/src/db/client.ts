import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { appConfig, syncState } from '../schema/sqlite/app.js';
import {
  documentRelations,
  documentContentRelations,
  documentSignatureRelations,
  duplicateGroupRelations,
  duplicateMemberRelations,
} from '../schema/relations.js';

const schema = {
  document,
  documentContent,
  documentSignature,
  duplicateGroup,
  duplicateMember,
  job,
  appConfig,
  syncState,
  documentRelations,
  documentContentRelations,
  documentSignatureRelations,
  duplicateGroupRelations,
  duplicateMemberRelations,
};

function createDrizzle(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDrizzle>;

function openSqlite(path: string): Database.Database {
  const filePath = path.startsWith('file:') ? path.slice(5) : path;
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  return sqlite;
}

export function createDatabaseWithHandle(path: string): { db: AppDatabase; sqlite: Database.Database } {
  const sqlite = openSqlite(path);
  const db = createDrizzle(sqlite);
  return { db, sqlite };
}

export function createDatabase(path: string): AppDatabase {
  return createDatabaseWithHandle(path).db;
}

export { Database };
