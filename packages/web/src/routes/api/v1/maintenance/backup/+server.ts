import { Readable } from 'node:stream';

import { OperationConflictError } from '@paperless-dedupe/core';
import {
  BackupInProgressError,
  claimDatabaseBackupLease,
  createDatabaseBackup,
  DatabaseBackupError,
  finalizeRecoveredDatabaseBackupLease,
  isDatabaseBackupLeaseOwner,
  releaseDatabaseBackupLease,
  removeStaleDatabaseBackupArtifact,
  renewDatabaseBackupLease,
  type DatabaseBackupArtifact,
} from '@paperless-dedupe/core/maintenance/backup';
import { nanoid } from 'nanoid';

import { apiError, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../runtime.server';
import type { RequestHandler } from './$types';

const SAFE_DOWNLOAD_NAME =
  /^paperless-ngx-dedupe-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite3$/;
const BACKUP_LEASE_DURATION_MS = 30_000;
const BACKUP_HEARTBEAT_INTERVAL_MS = 5_000;

function artifactStream(
  artifact: DatabaseBackupArtifact,
  cleanup: () => Promise<void>,
  leaseIsValid: () => boolean,
): ReadableStream<Uint8Array> {
  const file = artifact.handle.createReadStream({
    autoClose: false,
    start: 0,
    end: Math.max(0, artifact.size - 1),
  });
  const reader = Readable.toWeb(file).getReader();
  let cleaned = false;
  const cleanupOnce = async () => {
    if (cleaned) return;
    cleaned = true;
    await cleanup();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!leaseIsValid()) throw new DatabaseBackupError();
        const next = await reader.read();
        if (!leaseIsValid()) throw new DatabaseBackupError();
        if (next.done) {
          await cleanupOnce();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        await cleanupOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        file.destroy();
        await cleanupOnce();
      }
    },
  });
}

export const GET: RequestHandler = async ({ locals }) => {
  const runtime = await getServerRuntime();
  const ownerId = nanoid(32);
  let leaseAcquired = false;
  let leaseOwnerId = ownerId;
  let recoveryPending = false;
  let leaseValid = true;
  let artifact: DatabaseBackupArtifact | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (heartbeat) clearInterval(heartbeat);
    try {
      await artifact?.remove();
    } finally {
      if (leaseAcquired && !recoveryPending) {
        releaseDatabaseBackupLease(locals.sqlite, leaseOwnerId);
        leaseAcquired = false;
      }
    }
  };

  try {
    runtime.acceptingGate.assertAccepting();
    return await runtime.acceptingGate.run(async () => {
      const claim = claimDatabaseBackupLease(
        locals.sqlite,
        ownerId,
        new Date(),
        BACKUP_LEASE_DURATION_MS,
      );
      leaseAcquired = true;
      leaseOwnerId = claim.leaseOwnerId;
      if (claim.recoveredOwnerId) {
        recoveryPending = true;
        await removeStaleDatabaseBackupArtifact(locals.sqlite, claim.recoveredOwnerId);
        if (
          !finalizeRecoveredDatabaseBackupLease(
            locals.sqlite,
            claim.leaseToken,
            ownerId,
            new Date(),
            BACKUP_LEASE_DURATION_MS,
          )
        ) {
          throw new DatabaseBackupError();
        }
        leaseOwnerId = ownerId;
        recoveryPending = false;
      }
      heartbeat = setInterval(() => {
        try {
          leaseValid = renewDatabaseBackupLease(
            locals.sqlite,
            leaseOwnerId,
            new Date(),
            BACKUP_LEASE_DURATION_MS,
          );
        } catch {
          leaseValid = false;
        }
        if (!leaseValid && heartbeat) clearInterval(heartbeat);
      }, BACKUP_HEARTBEAT_INTERVAL_MS);
      heartbeat.unref();

      artifact = await createDatabaseBackup(locals.sqlite, { ownerId });
      if (!leaseValid) throw new DatabaseBackupError();
      if (!SAFE_DOWNLOAD_NAME.test(artifact.downloadName)) {
        throw new DatabaseBackupError();
      }

      return new Response(
        artifactStream(
          artifact,
          cleanup,
          () => leaseValid && isDatabaseBackupLeaseOwner(locals.sqlite, leaseOwnerId, new Date()),
        ),
        {
          headers: {
            'Content-Type': 'application/vnd.sqlite3',
            'Content-Disposition': `attachment; filename="${artifact.downloadName}"`,
            'Content-Length': String(artifact.size),
            'Cache-Control': 'private, no-store, max-age=0',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    });
  } catch (error) {
    await cleanup();
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'database_backup', retryable: true },
        503,
      );
    }
    if (error instanceof BackupInProgressError || error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, { operation: 'database_backup', retryable: true }, 409);
    }
    if (error instanceof DatabaseBackupError) {
      return apiError(
        ErrorCode.INTERNAL_ERROR,
        { operation: 'database_backup', retryable: true },
        500,
      );
    }
    throw error;
  }
};
