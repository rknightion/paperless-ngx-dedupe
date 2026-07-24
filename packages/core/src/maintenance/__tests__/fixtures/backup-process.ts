import { setTimeout as delay } from 'node:timers/promises';

import Database from 'better-sqlite3';

import {
  claimDatabaseBackupLease,
  createDatabaseBackup,
  finalizeRecoveredDatabaseBackupLease,
  isDatabaseBackupLeaseOwner,
  releaseDatabaseBackupLease,
  removeStaleDatabaseBackupArtifact,
  renewDatabaseBackupLease,
} from '../../backup.js';
import { OperationConflictError } from '../../../scheduler/coordinator.js';

const [mode, databasePath, ownerId, leaseDurationInput, foreignPath] = process.argv.slice(2);
const leaseDurationMs = Number(leaseDurationInput);
const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

function send(message: Record<string, unknown>): void {
  process.send?.(message);
}

if (mode === 'hold') {
  const claim = claimDatabaseBackupLease(sqlite, ownerId!, new Date(), leaseDurationMs);
  const heartbeat = setInterval(
    () => renewDatabaseBackupLease(sqlite, claim.leaseToken, new Date(), leaseDurationMs),
    Math.max(10, Math.floor(leaseDurationMs / 4)),
  );
  const artifact = await createDatabaseBackup(sqlite, { ownerId: ownerId! });
  const header = Buffer.alloc(16);
  await artifact.handle.read(header, 0, header.length, 0);
  send({ stage: 'mid-download', path: artifact.path, header: header.toString() });
  process.on('message', (message: { action?: string }) => {
    if (message.action === 'verify-fence') {
      const oldCanRenew = renewDatabaseBackupLease(
        sqlite,
        claim.leaseToken,
        new Date(),
        leaseDurationMs,
      );
      const oldOwns = isDatabaseBackupLeaseOwner(sqlite, claim.leaseToken, new Date());
      void (async () => {
        let bytesReadAfterResume = 0;
        if (oldOwns) {
          const resumedBuffer = Buffer.alloc(64);
          const read = await artifact.handle.read(resumedBuffer, 0, resumedBuffer.length, 16);
          if (isDatabaseBackupLeaseOwner(sqlite, claim.leaseToken, new Date())) {
            bytesReadAfterResume = read.bytesRead;
          }
        }
        send({
          stage: 'fenced',
          oldCanRenew,
          oldOwns,
          bytesReadAfterResume,
        });
      })();
    } else if (message.action === 'cleanup') {
      clearInterval(heartbeat);
      void artifact.remove().finally(() => {
        releaseDatabaseBackupLease(sqlite, claim.leaseToken);
        sqlite.close();
        process.exit(0);
      });
    }
  });
  // The parent deliberately SIGKILLs this process. No cleanup handler is
  // registered: the test proves recovery from an abrupt process death.
  await new Promise(() => undefined);
  clearInterval(heartbeat);
} else if (mode === 'recover' || mode === 'recover-hold') {
  let recoveredOwnerId: string | null = null;
  let leaseToken = '';
  let conflicts = 0;
  while (recoveredOwnerId === null) {
    try {
      const claim = claimDatabaseBackupLease(sqlite, ownerId!, new Date(), leaseDurationMs);
      recoveredOwnerId = claim.recoveredOwnerId;
      leaseToken = claim.leaseToken;
    } catch (error) {
      if (!(error instanceof OperationConflictError)) throw error;
      conflicts += 1;
      await delay(20);
    }
  }

  const staleRemoved = await removeStaleDatabaseBackupArtifact(sqlite, recoveredOwnerId);
  if (
    !finalizeRecoveredDatabaseBackupLease(sqlite, leaseToken, ownerId!, new Date(), leaseDurationMs)
  ) {
    throw new Error('Failed to finalize recovered backup lease');
  }
  const artifact = await createDatabaseBackup(sqlite, { ownerId: ownerId! });
  const snapshot = new Database(artifact.path, { readonly: true, fileMustExist: true });
  const integrity = snapshot.pragma('integrity_check', { simple: true });
  snapshot.close();
  const foreign = new Database(foreignPath!, { readonly: true, fileMustExist: true });
  const foreignMarker = foreign.prepare('SELECT marker FROM foreign_file').pluck().get();
  foreign.close();
  send({
    stage: 'recovered',
    recoveredOwnerId,
    conflicts,
    staleRemoved,
    integrity,
    foreignMarker,
  });
  if (mode === 'recover') {
    await artifact.remove();
    releaseDatabaseBackupLease(sqlite, ownerId!);
    sqlite.close();
  } else {
    const heartbeat = setInterval(
      () => renewDatabaseBackupLease(sqlite, ownerId!, new Date(), leaseDurationMs),
      Math.max(10, Math.floor(leaseDurationMs / 4)),
    );
    process.on('message', (message: { action?: string }) => {
      if (message.action !== 'cleanup') return;
      clearInterval(heartbeat);
      void artifact.remove().finally(() => {
        releaseDatabaseBackupLease(sqlite, ownerId!);
        sqlite.close();
        process.exit(0);
      });
    });
  }
} else {
  throw new Error('Unknown backup process mode');
}
