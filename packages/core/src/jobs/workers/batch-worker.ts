import { z } from 'zod';

import { runWorkerTask } from '../worker-entry.js';
import type { ProgressCallback, WorkerContext } from '../worker-entry.js';
import { PaperlessClient } from '../../paperless/client.js';
import { PaperlessApiError, PaperlessConnectionError } from '../../paperless/errors.js';
import { toPaperlessConfig } from '../../paperless/schemas.js';
import { parseConfig } from '../../config.js';
import {
  claimDuplicateDeletionPlan,
  completeDuplicateDeletionPlan,
  finalizeDuplicateGroupLocally,
  getDuplicateDeletionCheckpointState,
  markDuplicateDocumentDeleteStarted,
  markDuplicateDocumentFailed,
  markDuplicateDocumentRemoteDeleted,
  markDuplicateGroupConflict,
  markDuplicateGroupStarted,
  reconcileDuplicateDocumentLocally,
  revalidateFrozenDuplicateGroup,
} from '../../review/mutation-plans.js';

const batchTaskDataSchema = z
  .object({
    planToken: z.string().min(32).max(256),
  })
  .strict();

type DeleteDocumentClient = Pick<PaperlessClient, 'deleteDocument'>;

type BatchConflict = {
  groupId: string;
  reason: 'missing' | 'changed';
};

type BatchError = {
  groupId: string;
  code: 'paperless_delete_failed';
  retryable: boolean;
};

export type ReviewedDuplicateDeletionResult = {
  deletedDocuments: number;
  alreadyMissingDocuments: number;
  deletedGroups: number;
  conflicts: BatchConflict[];
  errors: BatchError[];
};

export class DuplicateDeleteLeaseError extends Error {
  constructor() {
    super('Duplicate deletion worker does not own the required operation lease');
    this.name = 'DuplicateDeleteLeaseError';
  }
}

export class DuplicateDeletionRemoteError extends Error {
  constructor(public readonly retryable: boolean) {
    super(
      retryable
        ? 'Paperless duplicate deletion failed with a retryable network error'
        : 'Paperless duplicate deletion failed with a non-retryable remote error',
    );
    this.name = 'DuplicateDeletionRemoteError';
  }
}

export type DuplicateDeletionWorkerHooks = {
  /** Test seam for the exact remote-success / durable-checkpoint crash boundary. */
  afterRemoteDelete?: (paperlessId: number) => void | Promise<void>;
  /** Test seam for a mutation racing the coherent group/member snapshot. */
  afterRevalidationGroupRead?: () => void;
};

function assertDuplicateDeleteLease(ctx: WorkerContext): void {
  const lease = ctx.sqlite
    .prepare(
      `SELECT 1
       FROM operation_lease
       WHERE owner_id = ? AND operation = 'duplicate_delete'`,
    )
    .get(ctx.jobId);
  if (!lease) throw new DuplicateDeleteLeaseError();
}

function classifyPaperlessFailure(error: unknown): Pick<BatchError, 'code' | 'retryable'> {
  return {
    code: 'paperless_delete_failed',
    retryable:
      error instanceof PaperlessApiError
        ? error.isRetryable
        : error instanceof PaperlessConnectionError || error instanceof TypeError,
  };
}

function resultFromCheckpoints(
  ctx: WorkerContext,
  planId: string,
): ReviewedDuplicateDeletionResult {
  const state = getDuplicateDeletionCheckpointState(ctx.sqlite, planId);
  const failedGroups = new Map<string, boolean>();
  for (const checkpoint of state.documents) {
    if (checkpoint.status === 'delete_failed') {
      failedGroups.set(
        checkpoint.groupId,
        (failedGroups.get(checkpoint.groupId) ?? false) || checkpoint.retryable === true,
      );
    }
  }
  return {
    deletedDocuments: state.documents.filter(({ status }) => status === 'reconciled').length,
    alreadyMissingDocuments: state.documents.filter(
      ({ status, outcome }) => status === 'reconciled' && outcome === 'already_missing',
    ).length,
    deletedGroups: state.groups.filter(({ status }) => status === 'completed').length,
    conflicts: state.groups
      .filter(
        (
          checkpoint,
        ): checkpoint is typeof checkpoint & {
          conflictReason: 'missing' | 'changed';
        } => checkpoint.status === 'conflict' && checkpoint.conflictReason !== null,
      )
      .map(({ groupId, conflictReason }) => ({ groupId, reason: conflictReason })),
    errors: [...failedGroups].map(([groupId, retryable]) => ({
      groupId,
      code: 'paperless_delete_failed',
      retryable,
    })),
  };
}

export async function executeReviewedDuplicateDeletion(
  ctx: WorkerContext,
  onProgress: ProgressCallback,
  client: DeleteDocumentClient,
  now: Date = new Date(),
  hooks: DuplicateDeletionWorkerHooks = {},
): Promise<ReviewedDuplicateDeletionResult> {
  assertDuplicateDeleteLease(ctx);
  const taskData = batchTaskDataSchema.safeParse(ctx.taskData);
  if (!taskData.success) throw new Error('Invalid duplicate deletion task data');

  const plan = claimDuplicateDeletionPlan(ctx.db, taskData.data.planToken, ctx.jobId, now);

  for (let index = 0; index < plan.groups.length; index++) {
    const frozenGroup = plan.groups[index];
    await onProgress(
      index / plan.groups.length,
      `Processing reviewed group ${index + 1} of ${plan.groups.length}`,
    );

    const beforeState = getDuplicateDeletionCheckpointState(ctx.sqlite, plan.planId);
    const beforeGroup = beforeState.groups.find(({ groupId }) => groupId === frozenGroup.groupId);
    if (beforeGroup?.status === 'completed' || beforeGroup?.status === 'conflict') continue;

    const revalidation = revalidateFrozenDuplicateGroup(ctx.db, frozenGroup, {
      afterGroupRead: hooks.afterRevalidationGroupRead,
      reconciledDocumentIds: new Set(
        beforeState.documents
          .filter(
            ({ groupId, status }) => groupId === frozenGroup.groupId && status === 'reconciled',
          )
          .map(({ documentId }) => documentId),
      ),
    });
    if (!revalidation.ok) {
      markDuplicateGroupConflict(
        ctx.sqlite,
        plan.planId,
        frozenGroup.groupId,
        revalidation.reason,
        now,
      );
      continue;
    }

    markDuplicateGroupStarted(ctx.sqlite, plan.planId, frozenGroup.groupId, now);
    for (const frozenDocument of frozenGroup.nonPrimaryDocuments) {
      const checkpoint = getDuplicateDeletionCheckpointState(
        ctx.sqlite,
        plan.planId,
      ).documents.find(
        ({ groupId, documentId }) =>
          groupId === frozenGroup.groupId && documentId === frozenDocument.documentId,
      );
      if (checkpoint?.status === 'reconciled') continue;
      if (checkpoint?.status === 'remote_deleted') {
        reconcileDuplicateDocumentLocally(
          ctx.sqlite,
          plan.planId,
          frozenGroup.groupId,
          frozenDocument,
          now,
        );
        continue;
      }
      if (
        !markDuplicateDocumentDeleteStarted(
          ctx.sqlite,
          plan.planId,
          frozenGroup.groupId,
          frozenDocument.documentId,
          now,
        )
      ) {
        continue;
      }
      let remoteOutcome: 'deleted' | 'already_missing';
      try {
        await client.deleteDocument(frozenDocument.paperlessId);
        remoteOutcome = 'deleted';
      } catch (error) {
        if (error instanceof PaperlessApiError && error.statusCode === 404) {
          remoteOutcome = 'already_missing';
        } else {
          const failure = classifyPaperlessFailure(error);
          markDuplicateDocumentFailed(
            ctx.sqlite,
            plan.planId,
            frozenGroup.groupId,
            frozenDocument.documentId,
            failure.retryable,
            now,
          );
          continue;
        }
      }
      await hooks.afterRemoteDelete?.(frozenDocument.paperlessId);
      markDuplicateDocumentRemoteDeleted(
        ctx.sqlite,
        plan.planId,
        frozenGroup.groupId,
        frozenDocument.documentId,
        remoteOutcome,
        now,
      );
      reconcileDuplicateDocumentLocally(
        ctx.sqlite,
        plan.planId,
        frozenGroup.groupId,
        frozenDocument,
        now,
      );
    }

    const groupDocuments = getDuplicateDeletionCheckpointState(
      ctx.sqlite,
      plan.planId,
    ).documents.filter(({ groupId }) => groupId === frozenGroup.groupId);
    if (groupDocuments.every(({ status }) => status === 'reconciled')) {
      finalizeDuplicateGroupLocally(ctx.sqlite, plan.planId, frozenGroup, now);
    }
  }

  const result = resultFromCheckpoints(ctx, plan.planId);
  if (result.errors.length > 0) {
    throw new DuplicateDeletionRemoteError(result.errors.some(({ retryable }) => retryable));
  }

  completeDuplicateDeletionPlan(ctx.sqlite, plan.planId, ctx.jobId, now);
  await onProgress(1, 'Batch operation complete');
  return result;
}

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);
  const client = new PaperlessClient(toPaperlessConfig(config));
  return executeReviewedDuplicateDeletion(ctx, onProgress, client);
});
