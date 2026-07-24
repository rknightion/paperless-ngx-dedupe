import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import type { AppDatabase } from '../db/client.js';
import type { ReviewedMutationPlan } from '../schema/types.js';
import { document } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { reviewedMutationPlan } from '../schema/sqlite/review.js';
import { acquireOperation, releaseOperation } from '../scheduler/coordinator.js';

export const REVIEWED_MUTATION_PLAN_TTL_MS = 15 * 60 * 1000;

export type ReviewedMutationOperation = 'ai_apply' | 'ai_revert' | 'duplicate_delete';

export type FrozenDuplicateDocument = {
  documentId: string;
  paperlessId: number;
};

export type FrozenDuplicateGroup = {
  groupId: string;
  updatedAt: string;
  primaryDocumentId: string;
  primaryPaperlessId: number;
  nonPrimaryDocuments: FrozenDuplicateDocument[];
};

export type DuplicateDeletionPlanPayload = {
  groups: FrozenDuplicateGroup[];
};

export type DuplicateDeletionPlanPreview = {
  token: string;
  expiresAt: string;
  groups: FrozenDuplicateGroup[];
};

export type DuplicateGroupRevalidation =
  { ok: true } | { ok: false; reason: 'missing' | 'changed' };

export type MutationPlanFailure =
  'not_found' | 'expired' | 'claimed' | 'consumed' | 'operation_mismatch' | 'invalid_payload';

export class MutationPlanError extends Error {
  constructor(public readonly reason: MutationPlanFailure) {
    super(`Reviewed mutation plan is ${reason.replaceAll('_', ' ')}`);
    this.name = 'MutationPlanError';
  }
}

export type DuplicateDeletionPreviewFailure =
  | 'duplicate_group'
  | 'missing_group'
  | 'non_pending_group'
  | 'missing_primary'
  | 'multiple_primaries'
  | 'no_non_primary_documents';

export class DuplicateDeletionPreviewError extends Error {
  constructor(public readonly reason: DuplicateDeletionPreviewFailure) {
    super(`Duplicate deletion preview is invalid: ${reason.replaceAll('_', ' ')}`);
    this.name = 'DuplicateDeletionPreviewError';
  }
}

const frozenDocumentSchema = z.object({
  documentId: z.string().min(1),
  paperlessId: z.number().int().nonnegative(),
});

const frozenGroupSchema = z.object({
  groupId: z.string().min(1),
  updatedAt: z.string().min(1),
  primaryDocumentId: z.string().min(1),
  primaryPaperlessId: z.number().int().nonnegative(),
  nonPrimaryDocuments: z.array(frozenDocumentSchema).min(1),
});

const duplicateDeletionPayloadSchema = z.object({
  groups: z.array(frozenGroupSchema).min(1),
});

const GROUP_QUERY_CHUNK_SIZE = 400;

type ClaimedPlanRow = {
  id: string;
  payloadJson: string;
};

export type ClaimedDuplicateDeletionPlan = DuplicateDeletionPlanPayload & {
  planId: string;
};

export type DuplicateGroupCheckpointStatus =
  'pending' | 'in_progress' | 'completed' | 'conflict' | 'failed';

export type DuplicateDocumentCheckpointStatus =
  'pending' | 'delete_started' | 'remote_deleted' | 'delete_failed' | 'reconciled';

export type DuplicateGroupCheckpoint = {
  groupId: string;
  ordinal: number;
  status: DuplicateGroupCheckpointStatus;
  conflictReason: 'missing' | 'changed' | null;
};

export type DuplicateDocumentCheckpoint = {
  groupId: string;
  documentId: string;
  paperlessId: number;
  ordinal: number;
  status: DuplicateDocumentCheckpointStatus;
  outcome: 'deleted' | 'already_missing' | null;
  retryable: boolean | null;
};

export type DuplicateDeletionCheckpointState = {
  groups: DuplicateGroupCheckpoint[];
  documents: DuplicateDocumentCheckpoint[];
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sqliteFor(db: AppDatabase): Database.Database {
  const sqlite = (db as unknown as { $client?: Database.Database }).$client;
  if (!sqlite) throw new Error('AppDatabase does not expose its SQLite client');
  return sqlite;
}

function parseDuplicateDeletionPayload(payloadJson: string): DuplicateDeletionPlanPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new MutationPlanError('invalid_payload');
  }
  const parsed = duplicateDeletionPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new MutationPlanError('invalid_payload');
  return parsed.data;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function freezeDuplicateGroups(
  db: Pick<AppDatabase, 'select'>,
  requestedGroupIds: readonly string[],
): FrozenDuplicateGroup[] {
  if (new Set(requestedGroupIds).size !== requestedGroupIds.length) {
    throw new DuplicateDeletionPreviewError('duplicate_group');
  }

  const groups = new Map<
    string,
    {
      updatedAt: string;
      status: string;
      members: Array<FrozenDuplicateDocument & { isPrimary: boolean | null }>;
    }
  >();

  for (const groupIds of chunks(requestedGroupIds, GROUP_QUERY_CHUNK_SIZE)) {
    const groupRows = db
      .select({
        id: duplicateGroup.id,
        updatedAt: duplicateGroup.updatedAt,
        status: duplicateGroup.status,
      })
      .from(duplicateGroup)
      .where(inArray(duplicateGroup.id, groupIds))
      .all();
    for (const group of groupRows) {
      groups.set(group.id, { updatedAt: group.updatedAt, status: group.status, members: [] });
    }

    const memberRows = db
      .select({
        groupId: duplicateMember.groupId,
        documentId: duplicateMember.documentId,
        isPrimary: duplicateMember.isPrimary,
        paperlessId: document.paperlessId,
      })
      .from(duplicateMember)
      .innerJoin(document, eq(duplicateMember.documentId, document.id))
      .where(inArray(duplicateMember.groupId, groupIds))
      .all();
    for (const member of memberRows) {
      groups.get(member.groupId)?.members.push({
        documentId: member.documentId,
        paperlessId: member.paperlessId,
        isPrimary: member.isPrimary,
      });
    }
  }

  return requestedGroupIds.map((groupId) => {
    const group = groups.get(groupId);
    if (!group) throw new DuplicateDeletionPreviewError('missing_group');
    if (group.status !== 'pending') {
      throw new DuplicateDeletionPreviewError('non_pending_group');
    }

    const primaryMembers = group.members.filter((member) => member.isPrimary === true);
    if (primaryMembers.length === 0) {
      throw new DuplicateDeletionPreviewError('missing_primary');
    }
    if (primaryMembers.length > 1) {
      throw new DuplicateDeletionPreviewError('multiple_primaries');
    }

    const nonPrimaryDocuments = group.members
      .filter((member) => member.isPrimary !== true)
      .map(({ documentId, paperlessId }) => ({ documentId, paperlessId }))
      .sort(
        (left, right) =>
          left.paperlessId - right.paperlessId || left.documentId.localeCompare(right.documentId),
      );
    if (nonPrimaryDocuments.length === 0) {
      throw new DuplicateDeletionPreviewError('no_non_primary_documents');
    }

    const primary = primaryMembers[0];
    return {
      groupId,
      updatedAt: group.updatedAt,
      primaryDocumentId: primary.documentId,
      primaryPaperlessId: primary.paperlessId,
      nonPrimaryDocuments,
    };
  });
}

export function createDuplicateDeletionPlan(
  db: AppDatabase,
  groupIds: readonly string[],
  options: {
    now?: Date;
    ttlMs?: number;
    tokenFactory?: () => string;
  } = {},
): DuplicateDeletionPlanPreview {
  if (groupIds.length === 0) throw new DuplicateDeletionPreviewError('missing_group');

  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? REVIEWED_MUTATION_PLAN_TTL_MS;
  const token = (options.tokenFactory ?? (() => nanoid(48)))();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return db.transaction(
    (tx) => {
      const groups = freezeDuplicateGroups(tx, groupIds);
      const payload: DuplicateDeletionPlanPayload = { groups };

      tx.insert(reviewedMutationPlan)
        .values({
          id: nanoid(),
          tokenHash: hashToken(token),
          operation: 'duplicate_delete',
          expiresAt,
          payloadJson: JSON.stringify(payload),
          consumedAt: null,
        })
        .run();

      return { token, expiresAt, groups };
    },
    { behavior: 'immediate' },
  );
}

export function revalidateFrozenDuplicateGroup(
  db: AppDatabase,
  frozen: FrozenDuplicateGroup,
  hooks: {
    afterGroupRead?: () => void;
    reconciledDocumentIds?: ReadonlySet<string>;
  } = {},
): DuplicateGroupRevalidation {
  return db.transaction(
    (tx) => {
      const group = tx
        .select({
          updatedAt: duplicateGroup.updatedAt,
          status: duplicateGroup.status,
        })
        .from(duplicateGroup)
        .where(eq(duplicateGroup.id, frozen.groupId))
        .get();
      if (!group) return { ok: false, reason: 'missing' };

      hooks.afterGroupRead?.();

      const members = tx
        .select({
          documentId: duplicateMember.documentId,
          isPrimary: duplicateMember.isPrimary,
          paperlessId: document.paperlessId,
        })
        .from(duplicateMember)
        .innerJoin(document, eq(duplicateMember.documentId, document.id))
        .where(eq(duplicateMember.groupId, frozen.groupId))
        .all();
      const primaryMembers = members.filter((member) => member.isPrimary === true);
      if (primaryMembers.length !== 1) return { ok: false, reason: 'changed' };

      const primary = primaryMembers[0];
      const nonPrimaryDocuments = members
        .filter((member) => member.isPrimary !== true)
        .map(({ documentId, paperlessId }) => ({ documentId, paperlessId }))
        .sort(
          (left, right) =>
            left.paperlessId - right.paperlessId || left.documentId.localeCompare(right.documentId),
        );

      const changed =
        group.status !== 'pending' ||
        group.updatedAt !== frozen.updatedAt ||
        primary.documentId !== frozen.primaryDocumentId ||
        primary.paperlessId !== frozen.primaryPaperlessId ||
        JSON.stringify(nonPrimaryDocuments) !==
          JSON.stringify(
            frozen.nonPrimaryDocuments.filter(
              ({ documentId }) => !hooks.reconciledDocumentIds?.has(documentId),
            ),
          );
      return changed ? { ok: false, reason: 'changed' } : { ok: true };
    },
    { behavior: 'immediate' },
  );
}

export function getReviewedMutationPlan(
  db: AppDatabase,
  token: string,
  operation: ReviewedMutationOperation,
  now: Date = new Date(),
): ReviewedMutationPlan {
  const plan = db
    .select()
    .from(reviewedMutationPlan)
    .where(eq(reviewedMutationPlan.tokenHash, hashToken(token)))
    .get();
  if (!plan) throw new MutationPlanError('not_found');
  if (plan.operation !== operation) throw new MutationPlanError('operation_mismatch');
  if (plan.consumedAt !== null) throw new MutationPlanError('consumed');
  if (plan.claimedByJobId !== null) throw new MutationPlanError('claimed');
  if (plan.expiresAt <= now.toISOString()) throw new MutationPlanError('expired');
  return plan;
}

function initializeDuplicateDeletionCheckpoints(
  sqlite: Database.Database,
  planId: string,
  payload: DuplicateDeletionPlanPayload,
  nowIso: string,
): void {
  const insertGroup = sqlite.prepare(
    `INSERT OR IGNORE INTO reviewed_mutation_group_checkpoint (
       plan_id, group_id, ordinal, status, conflict_reason, started_at, completed_at
     ) VALUES (?, ?, ?, 'pending', NULL, NULL, NULL)`,
  );
  const insertDocument = sqlite.prepare(
    `INSERT OR IGNORE INTO reviewed_mutation_document_checkpoint (
       plan_id, group_id, document_id, paperless_id, ordinal, status, outcome,
       attempt_count, retryable, started_at, remote_deleted_at, reconciled_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, NULL, NULL, NULL, ?)`,
  );
  for (let groupOrdinal = 0; groupOrdinal < payload.groups.length; groupOrdinal++) {
    const group = payload.groups[groupOrdinal];
    insertGroup.run(planId, group.groupId, groupOrdinal);
    for (
      let documentOrdinal = 0;
      documentOrdinal < group.nonPrimaryDocuments.length;
      documentOrdinal++
    ) {
      const frozenDocument = group.nonPrimaryDocuments[documentOrdinal];
      insertDocument.run(
        planId,
        group.groupId,
        frozenDocument.documentId,
        frozenDocument.paperlessId,
        documentOrdinal,
        nowIso,
      );
    }
  }
}

/**
 * Atomically validates expiry/operation and binds the opaque plan to a durable
 * job identity. The same job can replay this claim; a different job cannot.
 */
export function claimDuplicateDeletionPlan(
  db: AppDatabase,
  token: string,
  jobId: string,
  now: Date = new Date(),
): ClaimedDuplicateDeletionPlan {
  const sqlite = sqliteFor(db);
  const nowIso = now.toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const plan = sqlite
      .prepare(
        `UPDATE reviewed_mutation_plan
         SET claimed_by_job_id = COALESCE(claimed_by_job_id, ?),
             claimed_at = COALESCE(claimed_at, ?)
         WHERE token_hash = ?
           AND operation = 'duplicate_delete'
           AND (
             (
               claimed_by_job_id IS NULL
               AND consumed_at IS NULL
               AND expires_at > ?
             )
             OR claimed_by_job_id = ?
           )
         RETURNING id, payload_json AS payloadJson`,
      )
      .get(jobId, nowIso, hashToken(token), nowIso, jobId) as ClaimedPlanRow | undefined;
    if (!plan) {
      const existing = sqlite
        .prepare(
          `SELECT operation, expires_at AS expiresAt, consumed_at AS consumedAt,
                  claimed_by_job_id AS claimedByJobId
           FROM reviewed_mutation_plan WHERE token_hash = ?`,
        )
        .get(hashToken(token)) as
        | {
            operation: string;
            expiresAt: string;
            consumedAt: string | null;
            claimedByJobId: string | null;
          }
        | undefined;
      if (!existing) throw new MutationPlanError('not_found');
      if (existing.operation !== 'duplicate_delete') {
        throw new MutationPlanError('operation_mismatch');
      }
      if (existing.claimedByJobId && existing.claimedByJobId !== jobId) {
        throw new MutationPlanError('claimed');
      }
      if (existing.expiresAt <= nowIso) throw new MutationPlanError('expired');
      throw new MutationPlanError('consumed');
    }

    const payload = parseDuplicateDeletionPayload(plan.payloadJson);
    initializeDuplicateDeletionCheckpoints(sqlite, plan.id, payload, nowIso);
    sqlite.exec('COMMIT');
    return { planId: plan.id, ...payload };
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/** @deprecated Use claimDuplicateDeletionPlan with the durable job identity. */
export const consumeDuplicateDeletionPlan = claimDuplicateDeletionPlan;

export function getDuplicateDeletionCheckpointState(
  sqlite: Database.Database,
  planId: string,
): DuplicateDeletionCheckpointState {
  const groups = sqlite
    .prepare(
      `SELECT group_id AS groupId, ordinal, status, conflict_reason AS conflictReason
       FROM reviewed_mutation_group_checkpoint
       WHERE plan_id = ?
       ORDER BY ordinal`,
    )
    .all(planId) as DuplicateGroupCheckpoint[];
  const documents = sqlite
    .prepare(
      `SELECT group_id AS groupId, document_id AS documentId, paperless_id AS paperlessId,
              ordinal, status, outcome, retryable
       FROM reviewed_mutation_document_checkpoint
       WHERE plan_id = ?
       ORDER BY group_id, ordinal`,
    )
    .all(planId)
    .map((row) => {
      const typed = row as Omit<DuplicateDocumentCheckpoint, 'retryable'> & {
        retryable: number | null;
      };
      return {
        ...typed,
        retryable: typed.retryable === null ? null : Boolean(typed.retryable),
      };
    });
  return { groups, documents };
}

export function markDuplicateGroupStarted(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  now: Date,
): void {
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_group_checkpoint
       SET status = CASE WHEN status IN ('pending', 'failed') THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, ?)
       WHERE plan_id = ? AND group_id = ? AND status NOT IN ('completed', 'conflict')`,
    )
    .run(now.toISOString(), planId, groupId);
}

export function markDuplicateGroupConflict(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  reason: 'missing' | 'changed',
  now: Date,
): void {
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_group_checkpoint
       SET status = 'conflict', conflict_reason = ?, completed_at = ?
       WHERE plan_id = ? AND group_id = ? AND status NOT IN ('completed', 'conflict')`,
    )
    .run(reason, now.toISOString(), planId, groupId);
}

export function markDuplicateDocumentDeleteStarted(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  documentId: string,
  now: Date,
): boolean {
  const updated = sqlite
    .prepare(
      `UPDATE reviewed_mutation_document_checkpoint
       SET status = 'delete_started',
           attempt_count = attempt_count + 1,
           retryable = NULL,
           started_at = COALESCE(started_at, ?),
           updated_at = ?
       WHERE plan_id = ? AND group_id = ? AND document_id = ?
         AND status IN ('pending', 'delete_started', 'delete_failed')`,
    )
    .run(now.toISOString(), now.toISOString(), planId, groupId, documentId);
  return updated.changes === 1;
}

export function markDuplicateDocumentRemoteDeleted(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  documentId: string,
  outcome: 'deleted' | 'already_missing',
  now: Date,
): void {
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_document_checkpoint
       SET status = 'remote_deleted', outcome = ?, retryable = NULL,
           remote_deleted_at = ?, updated_at = ?
       WHERE plan_id = ? AND group_id = ? AND document_id = ?
         AND status = 'delete_started'`,
    )
    .run(outcome, now.toISOString(), now.toISOString(), planId, groupId, documentId);
}

export function markDuplicateDocumentFailed(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  documentId: string,
  retryable: boolean,
  now: Date,
): void {
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_document_checkpoint
       SET status = 'delete_failed', retryable = ?, updated_at = ?
       WHERE plan_id = ? AND group_id = ? AND document_id = ?
         AND status = 'delete_started'`,
    )
    .run(retryable ? 1 : 0, now.toISOString(), planId, groupId, documentId);
  sqlite
    .prepare(
      `UPDATE reviewed_mutation_group_checkpoint
       SET status = 'failed'
       WHERE plan_id = ? AND group_id = ? AND status = 'in_progress'`,
    )
    .run(planId, groupId);
}

function removeDocumentLocallyInTransaction(
  sqlite: Database.Database,
  documentId: string,
  currentGroupId: string,
  nowIso: string,
): void {
  const memberships = sqlite
    .prepare(
      `SELECT group_id AS groupId, is_primary AS isPrimary
       FROM duplicate_member
       WHERE document_id = ? AND group_id <> ?`,
    )
    .all(documentId, currentGroupId) as { groupId: string; isPrimary: number | null }[];
  sqlite.prepare('DELETE FROM duplicate_member WHERE document_id = ?').run(documentId);
  for (const membership of memberships) {
    const { remaining } = sqlite
      .prepare(`SELECT COUNT(*) AS remaining FROM duplicate_member WHERE group_id = ?`)
      .get(membership.groupId) as { remaining: number };
    if (remaining < 2) {
      sqlite
        .prepare(
          `UPDATE duplicate_group
           SET status = 'false_positive', updated_at = ?
           WHERE id = ? AND status <> 'deleted'`,
        )
        .run(nowIso, membership.groupId);
    } else if (membership.isPrimary) {
      const next = sqlite
        .prepare('SELECT id FROM duplicate_member WHERE group_id = ? ORDER BY id LIMIT 1')
        .get(membership.groupId) as { id: string } | undefined;
      if (next) {
        sqlite.prepare('UPDATE duplicate_member SET is_primary = 1 WHERE id = ?').run(next.id);
      }
      sqlite
        .prepare('UPDATE duplicate_group SET updated_at = ? WHERE id = ?')
        .run(nowIso, membership.groupId);
    } else {
      sqlite
        .prepare('UPDATE duplicate_group SET updated_at = ? WHERE id = ?')
        .run(nowIso, membership.groupId);
    }
  }
  sqlite.prepare('DELETE FROM document_signature WHERE document_id = ?').run(documentId);
  sqlite.prepare('DELETE FROM document_content WHERE document_id = ?').run(documentId);
  sqlite.prepare('DELETE FROM ai_processing_result WHERE document_id = ?').run(documentId);
  sqlite.prepare('DELETE FROM document WHERE id = ?').run(documentId);
}

/**
 * Reconciles one confirmed remote deletion with local state and its usage
 * audit atomically. The current reviewed group remains pending until every
 * frozen non-primary document has reached this checkpoint.
 */
export function reconcileDuplicateDocumentLocally(
  sqlite: Database.Database,
  planId: string,
  groupId: string,
  frozenDocument: FrozenDuplicateDocument,
  now: Date,
): boolean {
  const nowIso = now.toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const checkpoint = sqlite
      .prepare(
        `SELECT status FROM reviewed_mutation_document_checkpoint
         WHERE plan_id = ? AND group_id = ? AND document_id = ?`,
      )
      .get(planId, groupId, frozenDocument.documentId) as
      { status: DuplicateDocumentCheckpointStatus } | undefined;
    if (checkpoint?.status === 'reconciled') {
      sqlite.exec('COMMIT');
      return false;
    }
    if (checkpoint?.status !== 'remote_deleted') {
      sqlite.exec('ROLLBACK');
      return false;
    }

    removeDocumentLocallyInTransaction(sqlite, frozenDocument.documentId, groupId, nowIso);
    const reconciled = sqlite
      .prepare(
        `UPDATE reviewed_mutation_document_checkpoint
         SET status = 'reconciled', reconciled_at = ?, updated_at = ?
         WHERE plan_id = ? AND group_id = ? AND document_id = ?
           AND status = 'remote_deleted'`,
      )
      .run(nowIso, nowIso, planId, groupId, frozenDocument.documentId);
    if (reconciled.changes !== 1) throw new MutationPlanError('invalid_payload');
    sqlite
      .prepare(
        `INSERT INTO sync_state (id, cumulative_documents_deleted)
         VALUES ('singleton', 1)
         ON CONFLICT(id) DO UPDATE SET
           cumulative_documents_deleted =
             COALESCE(cumulative_documents_deleted, 0) + 1`,
      )
      .run();
    sqlite.exec('COMMIT');
    return true;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Archives the reviewed group and advances its audit/checkpoint in one
 * transaction after every document checkpoint is locally reconciled.
 */
export function finalizeDuplicateGroupLocally(
  sqlite: Database.Database,
  planId: string,
  frozen: FrozenDuplicateGroup,
  now: Date,
): boolean {
  const nowIso = now.toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const checkpoint = sqlite
      .prepare(
        `SELECT status FROM reviewed_mutation_group_checkpoint
         WHERE plan_id = ? AND group_id = ?`,
      )
      .get(planId, frozen.groupId) as { status: DuplicateGroupCheckpointStatus } | undefined;
    if (checkpoint?.status === 'completed') {
      sqlite.exec('COMMIT');
      return false;
    }
    if (!checkpoint || checkpoint.status === 'conflict') {
      sqlite.exec('ROLLBACK');
      return false;
    }
    const notDeleted = sqlite
      .prepare(
        `SELECT 1 FROM reviewed_mutation_document_checkpoint
         WHERE plan_id = ? AND group_id = ? AND status <> 'reconciled'
         LIMIT 1`,
      )
      .get(planId, frozen.groupId);
    if (notDeleted) {
      sqlite.exec('ROLLBACK');
      return false;
    }

    const primary = sqlite
      .prepare(
        `SELECT d.title
         FROM duplicate_member dm
         JOIN document d ON d.id = dm.document_id
         WHERE dm.group_id = ? AND dm.is_primary = 1`,
      )
      .get(frozen.groupId) as { title: string } | undefined;
    const archived = sqlite
      .prepare(
        `UPDATE duplicate_group
         SET status = 'deleted', archived_member_count = ?,
             archived_primary_title = ?, deleted_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(
        frozen.nonPrimaryDocuments.length + 1,
        primary?.title ?? null,
        nowIso,
        nowIso,
        frozen.groupId,
      );
    if (archived.changes !== 1) throw new MutationPlanError('invalid_payload');
    sqlite.prepare('DELETE FROM duplicate_member WHERE group_id = ?').run(frozen.groupId);

    sqlite
      .prepare(
        `INSERT INTO sync_state (id, cumulative_groups_actioned)
         VALUES ('singleton', 1)
         ON CONFLICT(id) DO UPDATE SET
           cumulative_groups_actioned =
             COALESCE(cumulative_groups_actioned, 0) + 1`,
      )
      .run();
    sqlite
      .prepare(
        `UPDATE reviewed_mutation_group_checkpoint
         SET status = 'completed', completed_at = ?
         WHERE plan_id = ? AND group_id = ?`,
      )
      .run(nowIso, planId, frozen.groupId);
    sqlite.exec('COMMIT');
    return true;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

export function completeDuplicateDeletionPlan(
  sqlite: Database.Database,
  planId: string,
  jobId: string,
  now: Date,
): boolean {
  const completed = sqlite
    .prepare(
      `UPDATE reviewed_mutation_plan
       SET completed_at = COALESCE(completed_at, ?),
           consumed_at = COALESCE(consumed_at, ?)
       WHERE id = ? AND claimed_by_job_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM reviewed_mutation_group_checkpoint
           WHERE plan_id = ? AND status NOT IN ('completed', 'conflict')
         )`,
    )
    .run(now.toISOString(), now.toISOString(), planId, jobId, planId);
  return completed.changes === 1;
}

export function withDuplicateMutationLease<T>(
  db: AppDatabase,
  mutation: () => T,
  ownerId: string = `duplicate-mutation-${nanoid()}`,
): T {
  const sqlite = sqliteFor(db);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    acquireOperation(sqlite, 'duplicate_delete', ownerId);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  try {
    return mutation();
  } finally {
    releaseOperation(sqlite, ownerId);
  }
}

export async function withDuplicateMutationLeaseAsync<T>(
  db: AppDatabase,
  mutation: () => Promise<T>,
  ownerId: string = `duplicate-mutation-${nanoid()}`,
): Promise<T> {
  const sqlite = sqliteFor(db);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    acquireOperation(sqlite, 'duplicate_delete', ownerId);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  try {
    return await mutation();
  } finally {
    releaseOperation(sqlite, ownerId);
  }
}
