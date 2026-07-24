import { createHmac, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import type {
  CustomFieldDiscoveryPageRequestV2,
  CustomFieldDiscoveryPageSourceV2,
  CustomFieldDiscoveryRunV2,
  CustomFieldDiscoverySourceSnapshotV2,
} from './custom-field-discovery-v2.js';

const MAX_CURSOR_COUNT = 64;
const MAX_PAGE_SIZE = 5_000;
const SAFE_FAILURE_CODE = 'DISCOVERY_FAILED';

interface CursorState {
  paperlessId: number;
  pass: CustomFieldDiscoveryPageRequestV2['pass'];
}

interface DiscoveryRunRow {
  publicKey: string;
  status: string;
  resultJson: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PublicCustomFieldDiscoveryRun {
  key: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
  result: CustomFieldDiscoveryRunV2 | null;
  error: { code: typeof SAFE_FAILURE_CODE; retryable: true } | null;
}

function randomOpaqueKey(): string {
  return randomBytes(24).toString('base64url');
}

function updateLengthPrefixed(digest: ReturnType<typeof createHmac>, value: string): void {
  digest.update(String(Buffer.byteLength(value)), 'utf8');
  digest.update(':', 'utf8');
  digest.update(value, 'utf8');
  digest.update(';', 'utf8');
}

function sourceState(
  sqlite: Database.Database,
  secret: string,
): CustomFieldDiscoverySourceSnapshotV2 {
  const digest = createHmac('sha256', secret);
  let documentCount = 0;
  const rows = sqlite
    .prepare(
      `SELECT d.paperless_id AS paperlessId,
              COALESCE(d.document_type, '') AS domain,
              COALESCE(c.full_text, '') AS ocrText
       FROM document d
       LEFT JOIN document_content c ON c.document_id = d.id
       ORDER BY d.paperless_id ASC`,
    )
    .iterate() as Iterable<{ paperlessId: number; domain: string; ocrText: string }>;

  for (const row of rows) {
    documentCount++;
    updateLengthPrefixed(digest, String(row.paperlessId));
    updateLengthPrefixed(digest, row.domain);
    updateLengthPrefixed(digest, row.ocrText);
  }

  return {
    documentCount,
    capturedAt: new Date().toISOString(),
    fingerprint: digest.digest('hex'),
  };
}

function decodeCursor(
  cursors: Map<string, CursorState>,
  cursor: string | null,
  pass: CustomFieldDiscoveryPageRequestV2['pass'],
): number {
  if (cursor === null) return 0;
  const state = cursors.get(cursor);
  if (!state || state.pass !== pass) throw new Error('Invalid discovery cursor');
  cursors.delete(cursor);
  return state.paperlessId;
}

function rememberCursor(cursors: Map<string, CursorState>, state: CursorState): string {
  const cursor = randomOpaqueKey();
  cursors.set(cursor, state);
  if (cursors.size > MAX_CURSOR_COUNT) {
    const oldest = cursors.keys().next().value;
    if (typeof oldest === 'string') cursors.delete(oldest);
  }
  return cursor;
}

/**
 * In-process-only keyset source. OCR and numeric document keys never leave this
 * boundary, while the cursor map remains hard bounded.
 */
export function createCustomFieldDiscoverySource(
  sqlite: Database.Database,
  opaqueToken: string,
): CustomFieldDiscoveryPageSourceV2 {
  const snapshot = sourceState(sqlite, opaqueToken);
  const cursors = new Map<string, CursorState>();

  return {
    opaqueToken,
    snapshot,
    async readPage(request) {
      if (
        request.sourceFingerprint !== snapshot.fingerprint ||
        !Number.isInteger(request.limit) ||
        request.limit < 1 ||
        request.limit > MAX_PAGE_SIZE
      ) {
        throw new Error('Invalid discovery page request');
      }

      const after = decodeCursor(cursors, request.cursor, request.pass);
      const rows = sqlite
        .prepare(
          `SELECT d.paperless_id AS paperlessId,
                  d.document_type AS domain,
                  c.full_text AS ocrText
           FROM document d
           LEFT JOIN document_content c ON c.document_id = d.id
           WHERE d.paperless_id > ?
           ORDER BY d.paperless_id ASC
           LIMIT ?`,
        )
        .all(after, request.limit + 1) as Array<{
        paperlessId: number;
        domain: string | null;
        ocrText: string | null;
      }>;
      const hasMore = rows.length > request.limit;
      const items = rows.slice(0, request.limit);
      const lastPaperlessId = items.at(-1)?.paperlessId;
      const nextCursor =
        hasMore && lastPaperlessId !== undefined
          ? rememberCursor(cursors, { paperlessId: lastPaperlessId, pass: request.pass })
          : null;

      return {
        items: items.map(({ domain, ocrText }) => ({ domain, ocrText })),
        nextCursor,
      };
    },
    async readCurrentFingerprint() {
      return sourceState(sqlite, opaqueToken).fingerprint;
    },
  };
}

export function beginCustomFieldDiscoveryRun(
  sqlite: Database.Database,
  jobId: string,
  sourceFingerprint: string,
  createdAt = new Date().toISOString(),
): string {
  const publicKey = randomOpaqueKey();
  const id = randomOpaqueKey();
  sqlite
    .prepare(
      `INSERT INTO custom_field_discovery_run (
         id, job_id, public_key, status, source_fingerprint, result_json,
         error_message, created_at, completed_at
       ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, ?, NULL)
       ON CONFLICT(job_id) DO UPDATE SET
         status = 'running',
         source_fingerprint = excluded.source_fingerprint,
         result_json = NULL,
         error_message = NULL,
         created_at = excluded.created_at,
         completed_at = NULL`,
    )
    .run(id, jobId, publicKey, sourceFingerprint, createdAt);

  const row = sqlite
    .prepare('SELECT public_key AS publicKey FROM custom_field_discovery_run WHERE job_id = ?')
    .get(jobId) as { publicKey: string } | undefined;
  if (!row) throw new Error('Failed to create custom-field discovery run');
  return row.publicKey;
}

function assertAggregateResult(result: CustomFieldDiscoveryRunV2): void {
  if (
    result.status !== 'completed' ||
    result.phase !== 'complete' ||
    result.stale ||
    !result.diagnostics.scan.complete
  ) {
    throw new Error('Cannot persist an incomplete custom-field discovery result');
  }
  const serialized = JSON.stringify(result);
  if (/"(?:ocrText|examples|documentId|paperlessId|jobId)"\s*:/.test(serialized)) {
    throw new Error('Custom-field discovery result contains private source data');
  }
}

export function completeCustomFieldDiscoveryRun(
  sqlite: Database.Database,
  jobId: string,
  result: CustomFieldDiscoveryRunV2,
  completedAt = new Date().toISOString(),
): void {
  assertAggregateResult(result);
  const update = sqlite
    .prepare(
      `UPDATE custom_field_discovery_run
       SET status = 'completed', result_json = ?, error_message = NULL, completed_at = ?
       WHERE job_id = ? AND status = 'running'`,
    )
    .run(JSON.stringify(result), completedAt, jobId);
  if (update.changes !== 1) throw new Error('Custom-field discovery run is not active');
}

export function failCustomFieldDiscoveryRun(
  sqlite: Database.Database,
  jobId: string,
  completedAt = new Date().toISOString(),
): void {
  sqlite
    .prepare(
      `UPDATE custom_field_discovery_run
       SET status = 'failed', result_json = NULL, error_message = ?, completed_at = ?
       WHERE job_id = ? AND status = 'running'`,
    )
    .run(SAFE_FAILURE_CODE, completedAt, jobId);
}

function sqliteFor(db: AppDatabase): Database.Database {
  return (db as AppDatabase & { $client: Database.Database }).$client;
}

export function getLatestCustomFieldDiscoveryRun(
  db: AppDatabase,
): PublicCustomFieldDiscoveryRun | null {
  const row = sqliteFor(db)
    .prepare(
      `SELECT public_key AS publicKey, status, result_json AS resultJson,
              created_at AS createdAt, completed_at AS completedAt
       FROM custom_field_discovery_run
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get() as DiscoveryRunRow | undefined;
  if (!row) return null;

  const status =
    row.status === 'completed' ? 'completed' : row.status === 'failed' ? 'failed' : 'running';
  let result: CustomFieldDiscoveryRunV2 | null = null;
  if (status === 'completed' && row.resultJson) {
    try {
      result = JSON.parse(row.resultJson) as CustomFieldDiscoveryRunV2;
      assertAggregateResult(result);
    } catch {
      return {
        key: row.publicKey,
        status: 'failed',
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        result: null,
        error: { code: SAFE_FAILURE_CODE, retryable: true },
      };
    }
  }

  return {
    key: row.publicKey,
    status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    result,
    error: status === 'failed' ? { code: SAFE_FAILURE_CODE, retryable: true } : null,
  };
}
