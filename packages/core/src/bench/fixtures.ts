import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';

import { createDatabaseWithHandle, type AppDatabase } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';

export const SYNTHETIC_BENCHMARK_SIZES = [10_000, 50_000] as const;
export const SYNTHETIC_BENCHMARK_SEED = 20_260_724;
const SYNTHETIC_BENCHMARK_MARKER_KEY = 'synthetic_benchmark_fixture';
const SYNTHETIC_BENCHMARK_FORMAT_VERSION = 1;

export interface SyntheticBenchmarkMetadata {
  synthetic: true;
  formatVersion: number;
  seed: number;
  documentCount: number;
  contentCount: number;
  duplicateGroupCount: number;
  duplicateMemberCount: number;
  aiResultCount: number;
  jobCount: number;
  nullAddedDateCount: number;
  schema: {
    userVersion: number;
    ddlHash: string;
  };
  pragmas: {
    journalMode: string;
    synchronous: number;
    foreignKeys: number;
    busyTimeoutMs: number;
  };
}

export interface SyntheticBenchmarkFixture {
  path: string;
  db: AppDatabase;
  sqlite: Database.Database;
  metadata: SyntheticBenchmarkMetadata;
  dispose(): void;
}

export interface SyntheticBenchmarkFixtureOptions {
  documentCount: number;
  parentDirectory?: string;
}

export interface SyntheticBenchmarkFailureInjection {
  failAt?: 'open' | 'migrate' | 'seed' | 'metadata' | 'close';
}

function benchmarkTimestamp(index: number): string {
  return new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString();
}

function padded(index: number): string {
  return String(index).padStart(8, '0');
}

export async function createSyntheticBenchmarkFixture(
  options: SyntheticBenchmarkFixtureOptions,
  failureInjection: SyntheticBenchmarkFailureInjection = {},
): Promise<SyntheticBenchmarkFixture> {
  if (!Number.isInteger(options.documentCount) || options.documentCount <= 0) {
    throw new Error('documentCount must be a positive integer');
  }

  const directory = mkdtempSync(
    join(options.parentDirectory ?? tmpdir(), 'paperless-dedupe-benchmark-'),
  );
  let ownershipTransferred = false;
  let handle: ReturnType<typeof createDatabaseWithHandle> | null = null;
  let disposed = false;
  try {
    if (failureInjection.failAt === 'open') throw new Error('Injected open failure');
    const path = join(directory, 'synthetic.sqlite3');
    handle = createDatabaseWithHandle(path);
    if (failureInjection.failAt === 'migrate') throw new Error('Injected migrate failure');
    await migrateDatabase(handle.sqlite);
    if (failureInjection.failAt === 'seed') throw new Error('Injected seed failure');
    seedSyntheticBenchmark(handle.sqlite, options.documentCount);
    if (failureInjection.failAt === 'metadata') throw new Error('Injected metadata failure');
    const metadata = readSyntheticBenchmarkMetadata(handle.sqlite);
    const ownedHandle = handle;
    ownershipTransferred = true;
    return {
      path,
      db: ownedHandle.db,
      sqlite: ownedHandle.sqlite,
      metadata,
      dispose() {
        if (disposed) return;
        disposed = true;
        let closeError: unknown;
        try {
          ownedHandle.sqlite.close();
          if (failureInjection.failAt === 'close') {
            throw new Error('Injected close failure');
          }
        } catch (error) {
          closeError = error;
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
        if (closeError) throw closeError;
      },
    };
  } finally {
    if (!ownershipTransferred) {
      try {
        handle?.sqlite.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
}

export function readSyntheticBenchmarkMetadata(
  sqlite: Database.Database,
): SyntheticBenchmarkMetadata {
  const markerRow = sqlite
    .prepare('SELECT value FROM app_config WHERE key = ?')
    .get(SYNTHETIC_BENCHMARK_MARKER_KEY) as { value: string } | undefined;
  if (!markerRow) throw new Error('Database is not a marked synthetic benchmark fixture');
  let marker: { formatVersion?: unknown; seed?: unknown; documentCount?: unknown };
  try {
    marker = JSON.parse(markerRow.value) as typeof marker;
  } catch {
    throw new Error('Synthetic benchmark fixture marker is invalid');
  }
  if (
    marker.formatVersion !== SYNTHETIC_BENCHMARK_FORMAT_VERSION ||
    marker.seed !== SYNTHETIC_BENCHMARK_SEED ||
    !Number.isInteger(marker.documentCount)
  ) {
    throw new Error('Synthetic benchmark fixture marker is invalid');
  }

  const counts = sqlite
    .prepare(
      `SELECT
         (SELECT count(*) FROM document) AS documentCount,
         (SELECT count(*) FROM document_content) AS contentCount,
         (SELECT count(*) FROM duplicate_group) AS duplicateGroupCount,
         (SELECT count(*) FROM duplicate_member) AS duplicateMemberCount,
         (SELECT count(*) FROM ai_processing_result) AS aiResultCount,
         (SELECT count(*) FROM job) AS jobCount,
         (SELECT count(*) FROM document WHERE added_date IS NULL) AS nullAddedDateCount`,
    )
    .get() as Omit<
    SyntheticBenchmarkMetadata,
    'synthetic' | 'formatVersion' | 'seed' | 'schema' | 'pragmas'
  >;
  if (counts.documentCount !== marker.documentCount) {
    throw new Error('Synthetic benchmark fixture cardinality does not match its marker');
  }
  const measuredDdl = (
    sqlite
      .prepare(
        `SELECT type, name, coalesce(sql, '') AS sql
         FROM sqlite_schema
         WHERE name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
      )
      .all() as { type: string; name: string; sql: string }[]
  )
    .map(({ type, name, sql }) => `${type}\u0000${name}\u0000${sql}`)
    .join('\u0001');
  return {
    synthetic: true,
    formatVersion: SYNTHETIC_BENCHMARK_FORMAT_VERSION,
    seed: SYNTHETIC_BENCHMARK_SEED,
    ...counts,
    schema: {
      userVersion: Number(sqlite.pragma('user_version', { simple: true })),
      ddlHash: createHash('sha256').update(measuredDdl).digest('hex'),
    },
    pragmas: {
      journalMode: String(sqlite.pragma('journal_mode', { simple: true })),
      synchronous: Number(sqlite.pragma('synchronous', { simple: true })),
      foreignKeys: Number(sqlite.pragma('foreign_keys', { simple: true })),
      busyTimeoutMs: Number(sqlite.pragma('busy_timeout', { simple: true })),
    },
  };
}

function seedSyntheticBenchmark(sqlite: Database.Database, documentCount: number): void {
  const duplicateGroupCount = Math.floor(documentCount * 0.1);
  const jobCount = Math.floor(documentCount * 0.5);

  const insertDocument = sqlite.prepare(`
    INSERT INTO document (
      id, paperless_id, title, fingerprint, correspondent, document_type, tags_json,
      custom_fields_json, created_date, added_date, modified_date, processing_status, synced_at,
      last_changed_by_sync_generation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertContent = sqlite.prepare(`
    INSERT INTO document_content (
      id, document_id, full_text, normalized_text, word_count, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertGroup = sqlite.prepare(`
    INSERT INTO duplicate_group (
      id, confidence_score, jaccard_similarity, fuzzy_text_ratio, discriminative_score,
      algorithm_version, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'synthetic-v1', ?, ?, ?)
  `);
  const insertMember = sqlite.prepare(`
    INSERT INTO duplicate_member (id, group_id, document_id, is_primary)
    VALUES (?, ?, ?, ?)
  `);
  const insertAiResult = sqlite.prepare(`
    INSERT INTO ai_processing_result (
      id, document_id, paperless_id, provider, model, suggested_title,
      suggested_correspondent, suggested_document_type, suggested_tags_json,
      confidence_json, current_title, current_correspondent, current_document_type,
      current_tags_json, applied_status, applied_at, failure_type, error_message,
      processing_time_ms, created_at, sync_generation_id
    ) VALUES (?, ?, ?, 'synthetic', 'benchmark-model', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertJob = sqlite.prepare(`
    INSERT INTO job (
      id, type, status, progress, completed_at, created_at, public_history_key
    ) VALUES (?, ?, ?, 1, ?, ?, ?)
  `);

  sqlite.transaction(() => {
    for (let index = 1; index <= documentCount; index += 1) {
      const suffix = padded(index);
      const timestamp = benchmarkTimestamp(Math.floor((index - 1) / 5));
      const correspondent = index % 11 === 0 ? null : `Synthetic Correspondent ${index % 40}`;
      const documentType = index % 13 === 0 ? null : `Synthetic Type ${index % 12}`;
      const tags =
        index % 17 === 0
          ? []
          : [`synthetic-tag-${index % 24}`, index % 2 === 0 ? 'synthetic-even' : 'synthetic-odd'];
      insertDocument.run(
        `synthetic-document-${suffix}`,
        index,
        `Synthetic Document ${suffix}`,
        `synthetic-fingerprint-${suffix}`,
        correspondent,
        documentType,
        JSON.stringify(tags),
        index % 5 === 0 ? '[]' : JSON.stringify([{ field: 1, value: `synthetic-${index % 20}` }]),
        timestamp,
        index % 20 === 0 ? null : timestamp,
        timestamp,
        index % 7 === 0 ? 'pending' : 'completed',
        timestamp,
        `synthetic-generation-${Math.floor(index / 1_000)}`,
      );
    }

    for (let index = 1; index <= documentCount; index += 1) {
      if (index % 5 === 0) continue;
      const suffix = padded(index);
      const text = `synthetic benchmark text ${index % 100} category ${index % 17}`;
      insertContent.run(
        `synthetic-content-${suffix}`,
        `synthetic-document-${suffix}`,
        text,
        text,
        80 + (index % 9_000),
        `synthetic-content-hash-${suffix}`,
      );
    }

    const duplicateStatuses = ['pending', 'pending', 'ignored', 'deleted'];
    for (let index = 1; index <= duplicateGroupCount; index += 1) {
      const suffix = padded(index);
      const timestamp = benchmarkTimestamp(index);
      const groupId = `synthetic-group-${suffix}`;
      insertGroup.run(
        groupId,
        0.55 + (index % 45) / 100,
        0.5 + (index % 50) / 100,
        0.6 + (index % 40) / 100,
        0.4 + (index % 60) / 100,
        duplicateStatuses[index % duplicateStatuses.length],
        timestamp,
        timestamp,
      );
      const groupSize = 2 + (index % 4);
      for (let member = 0; member < groupSize; member += 1) {
        const documentIndex = ((index * 7_919 + member * 1_543) % documentCount) + 1;
        insertMember.run(
          `synthetic-member-${suffix}-${member}`,
          groupId,
          `synthetic-document-${padded(documentIndex)}`,
          member === 0 ? 1 : 0,
        );
      }
    }

    const aiStatuses = [
      'pending_review',
      'failed',
      'applied',
      'partial',
      'reverted',
      'rejected',
      'skipped',
    ];
    for (let index = 1; index <= documentCount; index += 1) {
      if (index % 4 === 0) continue;
      const suffix = padded(index);
      const timestamp = benchmarkTimestamp(index);
      const status = aiStatuses[index % aiStatuses.length];
      const failureType =
        status === 'failed' ? (index % 9 === 0 ? 'review_conflict' : 'timeout') : null;
      const confidence =
        index % 10 === 0
          ? null
          : index % 3 === 0
            ? JSON.stringify({ title: 0.8, documentType: 0.75 })
            : JSON.stringify({
                title: 0.8,
                correspondent: 0.7,
                documentType: 0.75,
                tags: 0.65,
              });
      insertAiResult.run(
        `synthetic-ai-${suffix}`,
        `synthetic-document-${suffix}`,
        index,
        `Synthetic Suggested ${suffix}`,
        `Synthetic Correspondent ${(index + 1) % 40}`,
        `Synthetic Type ${(index + 1) % 12}`,
        JSON.stringify([`synthetic-tag-${(index + 1) % 24}`]),
        confidence,
        `Synthetic Document ${suffix}`,
        `Synthetic Correspondent ${index % 40}`,
        `Synthetic Type ${index % 12}`,
        JSON.stringify([`synthetic-tag-${index % 24}`]),
        status,
        ['applied', 'partial', 'reverted', 'rejected'].includes(status) ? timestamp : null,
        failureType,
        failureType ? 'synthetic failure category' : null,
        50 + (index % 250),
        timestamp,
        `synthetic-generation-${Math.floor(index / 1_000)}`,
      );
    }

    const jobTypes = ['sync', 'analysis', 'ai_processing', 'ai_apply'];
    const jobStatuses = ['completed', 'failed', 'cancelled'];
    for (let index = 1; index <= jobCount; index += 1) {
      const suffix = padded(index);
      const timestamp = benchmarkTimestamp(index);
      insertJob.run(
        `synthetic-job-${suffix}`,
        jobTypes[index % jobTypes.length],
        jobStatuses[index % jobStatuses.length],
        timestamp,
        timestamp,
        `synthetic-history-${suffix}`,
      );
    }

    sqlite
      .prepare(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(
        SYNTHETIC_BENCHMARK_MARKER_KEY,
        JSON.stringify({
          formatVersion: SYNTHETIC_BENCHMARK_FORMAT_VERSION,
          seed: SYNTHETIC_BENCHMARK_SEED,
          documentCount,
        }),
        benchmarkTimestamp(0),
      );
  })();

  sqlite.pragma('optimize');
}
