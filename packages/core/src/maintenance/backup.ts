import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type Database from 'better-sqlite3';

import {
  acquireOperation,
  OperationConflictError,
  releaseOperation,
} from '../scheduler/coordinator.js';
import { OPERATION_COMPATIBILITY, type OperationKind } from '../scheduler/store.js';

const BACKUP_FILE_PREFIX = '.paperless-ngx-dedupe-backup-';
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;
const RECOVERY_TOKEN_SEPARATOR = '.recover.';

interface FileIdentity {
  dev: number;
  ino: number;
}

export interface DatabaseBackupArtifact {
  path: string;
  downloadName: string;
  handle: FileHandle;
  size: number;
  remove(): Promise<void>;
}

export interface DatabaseBackupOptions {
  ownerId: string;
  now?: Date;
  progress?: (info: { totalPages: number; remainingPages: number }) => number;
}

export interface DatabaseBackupLeaseClaim {
  recoveredOwnerId: string | null;
  leaseOwnerId: string;
  leaseToken: string;
  expiresAt: string;
}

export class BackupInProgressError extends Error {
  constructor() {
    super('A database backup is already in progress');
    this.name = 'BackupInProgressError';
  }
}

export class DatabaseBackupError extends Error {
  constructor(options?: ErrorOptions) {
    super('Database backup failed', options);
    this.name = 'DatabaseBackupError';
  }
}

const BACKUP_STATE = Symbol.for('paperless-ngx-dedupe.database-backup-state');

interface BackupGlobalScope {
  [BACKUP_STATE]?: { active: boolean };
}

function backupState(): { active: boolean } {
  const scope = globalThis as BackupGlobalScope;
  return (scope[BACKUP_STATE] ??= { active: false });
}

function validateOwnerId(ownerId: string): void {
  if (!OWNER_ID_PATTERN.test(ownerId)) throw new DatabaseBackupError();
}

function recoveryArtifactOwner(leaseToken: string): string {
  const separator = leaseToken.indexOf(RECOVERY_TOKEN_SEPARATOR);
  const ownerId =
    separator === -1 ? leaseToken : leaseToken.slice(separator + RECOVERY_TOKEN_SEPARATOR.length);
  validateOwnerId(ownerId);
  return ownerId;
}

function validateLeaseToken(leaseToken: string): void {
  const separator = leaseToken.indexOf(RECOVERY_TOKEN_SEPARATOR);
  if (separator === -1) {
    validateOwnerId(leaseToken);
    return;
  }
  if (leaseToken.indexOf(RECOVERY_TOKEN_SEPARATOR, separator + 1) !== -1) {
    throw new DatabaseBackupError();
  }
  validateOwnerId(leaseToken.slice(0, separator));
  validateOwnerId(leaseToken.slice(separator + RECOVERY_TOKEN_SEPARATOR.length));
}

function identityOf(stats: Stats): FileIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

function sameIdentity(left: FileIdentity, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function safeDownloadName(now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `paperless-ngx-dedupe-backup-${timestamp}.sqlite3`;
}

async function sourceDirectory(source: Database.Database): Promise<string> {
  if (!source.open || source.name === ':memory:' || source.name.trim() === '') {
    throw new DatabaseBackupError();
  }
  const resolvedSource = await realpath(source.name);
  return realpath(dirname(resolvedSource));
}

async function artifactPath(source: Database.Database, ownerId: string): Promise<string> {
  validateOwnerId(ownerId);
  return join(await sourceDirectory(source), `${BACKUP_FILE_PREFIX}${ownerId}.sqlite3`);
}

async function lstatMatchingRegularFile(path: string, identity: FileIdentity): Promise<boolean> {
  try {
    const current = await lstat(path);
    return current.isFile() && !current.isSymbolicLink() && sameIdentity(identity, current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function unlinkIfIdentityMatches(path: string, identity: FileIdentity): Promise<boolean> {
  if (!(await lstatMatchingRegularFile(path, identity))) return false;
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Claims the durable backup operation lease in one BEGIN IMMEDIATE transaction.
 * Only an expired backup lease is reclaimable; all compatibility checks,
 * including an active VACUUM, remain authoritative.
 */
export function claimDatabaseBackupLease(
  sqlite: Database.Database,
  ownerId: string,
  now: Date,
  leaseDurationMs: number,
): DatabaseBackupLeaseClaim {
  validateOwnerId(ownerId);
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new DatabaseBackupError();
  }
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();

  return sqlite
    .transaction(() => {
      const existing = sqlite
        .prepare(
          `SELECT owner_id AS ownerId, expires_at AS expiresAt
           FROM operation_lease WHERE operation = 'backup'`,
        )
        .get() as { ownerId: string; expiresAt: string | null } | undefined;
      let recoveredOwnerId: string | null = null;
      if (existing) {
        if (existing.expiresAt === null || existing.expiresAt > nowIso) {
          throw new OperationConflictError('backup');
        }
        const activeOperations = sqlite
          .prepare(`SELECT operation FROM operation_lease WHERE operation <> 'backup'`)
          .all() as { operation: OperationKind }[];
        if (activeOperations.some(({ operation }) => !OPERATION_COMPATIBILITY.backup[operation])) {
          throw new OperationConflictError('backup');
        }
        validateLeaseToken(existing.ownerId);
        const recoveredArtifactOwner = recoveryArtifactOwner(existing.ownerId);
        const leaseToken = `${ownerId}${RECOVERY_TOKEN_SEPARATOR}${recoveredArtifactOwner}`;
        const reservedForRecovery = sqlite
          .prepare(
            `UPDATE operation_lease
             SET owner_id = ?, heartbeat_at = ?, expires_at = ?
             WHERE operation = 'backup' AND owner_id = ? AND expires_at = ? AND expires_at <= ?`,
          )
          .run(leaseToken, nowIso, expiresAt, existing.ownerId, existing.expiresAt, nowIso);
        if (reservedForRecovery.changes !== 1) throw new OperationConflictError('backup');
        recoveredOwnerId = recoveredArtifactOwner;
        return {
          recoveredOwnerId,
          leaseOwnerId: leaseToken,
          leaseToken,
          expiresAt,
        };
      }

      acquireOperation(sqlite, 'backup', ownerId);
      const bounded = sqlite
        .prepare(
          `UPDATE operation_lease
           SET heartbeat_at = ?, expires_at = ?
           WHERE operation = 'backup' AND owner_id = ?`,
        )
        .run(nowIso, expiresAt, ownerId);
      if (bounded.changes !== 1) throw new DatabaseBackupError();
      return { recoveredOwnerId, leaseOwnerId: ownerId, leaseToken: ownerId, expiresAt };
    })
    .immediate();
}

export function isDatabaseBackupLeaseOwner(
  sqlite: Database.Database,
  leaseToken: string,
  now: Date,
): boolean {
  try {
    validateLeaseToken(leaseToken);
  } catch {
    return false;
  }
  const row = sqlite
    .prepare(
      `SELECT 1 FROM operation_lease
       WHERE operation = 'backup' AND owner_id = ?
         AND expires_at IS NOT NULL AND expires_at > ?`,
    )
    .get(leaseToken, now.toISOString());
  return Boolean(row);
}

export function finalizeRecoveredDatabaseBackupLease(
  sqlite: Database.Database,
  leaseToken: string,
  ownerId: string,
  now: Date,
  leaseDurationMs: number,
): boolean {
  validateLeaseToken(leaseToken);
  validateOwnerId(ownerId);
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) return false;
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  const finalized = sqlite
    .prepare(
      `UPDATE operation_lease
       SET owner_id = ?, heartbeat_at = ?, expires_at = ?
       WHERE operation = 'backup' AND owner_id = ?
         AND expires_at IS NOT NULL AND expires_at > ?`,
    )
    .run(ownerId, nowIso, expiresAt, leaseToken, nowIso);
  return finalized.changes === 1;
}

export function renewDatabaseBackupLease(
  sqlite: Database.Database,
  leaseToken: string,
  now: Date,
  leaseDurationMs: number,
): boolean {
  validateLeaseToken(leaseToken);
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) return false;
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  const renewed = sqlite
    .prepare(
      `UPDATE operation_lease
       SET heartbeat_at = ?, expires_at = ?
       WHERE operation = 'backup' AND owner_id = ?
         AND expires_at IS NOT NULL AND expires_at > ?`,
    )
    .run(nowIso, expiresAt, leaseToken, nowIso);
  return renewed.changes === 1;
}

export function releaseDatabaseBackupLease(sqlite: Database.Database, leaseToken: string): boolean {
  validateLeaseToken(leaseToken);
  return releaseOperation(sqlite, leaseToken);
}

/**
 * Removes only the regular artifact whose unguessable owner ID was persisted
 * on the expired lease. Symlinks and all differently named files are ignored.
 */
export async function removeStaleDatabaseBackupArtifact(
  source: Database.Database,
  ownerId: string,
): Promise<boolean> {
  const path = await artifactPath(source, ownerId);
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP') return false;
    throw new DatabaseBackupError({ cause: error });
  }

  try {
    const descriptor = await handle.stat();
    if (!descriptor.isFile()) return false;
    const identity = identityOf(descriptor);
    if (!(await lstatMatchingRegularFile(path, identity))) return false;
    return unlinkIfIdentityMatches(path, identity);
  } catch (error) {
    throw error instanceof DatabaseBackupError ? error : new DatabaseBackupError({ cause: error });
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function createDatabaseBackup(
  source: Database.Database,
  options: DatabaseBackupOptions,
): Promise<DatabaseBackupArtifact> {
  validateOwnerId(options.ownerId);
  const state = backupState();
  if (state.active) throw new BackupInProgressError();
  state.active = true;

  let destinationPath: string | undefined;
  let handle: FileHandle | undefined;
  let reservedIdentity: FileIdentity | undefined;
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    try {
      if (destinationPath && reservedIdentity) {
        await unlinkIfIdentityMatches(destinationPath, reservedIdentity);
      }
    } finally {
      await handle?.close().catch(() => undefined);
      state.active = false;
    }
  };

  try {
    destinationPath = await artifactPath(source, options.ownerId);

    // Keep this exclusive, no-follow descriptor open for the artifact's entire
    // lifetime. SQLite writes through its own descriptor to the same inode.
    handle = await open(
      destinationPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    const reserved = await handle.stat();
    if (!reserved.isFile()) throw new DatabaseBackupError();
    reservedIdentity = identityOf(reserved);

    await source.backup(destinationPath, {
      progress: options.progress ?? (() => 100),
    });

    const completedDescriptor = await handle.stat();
    if (
      !completedDescriptor.isFile() ||
      !sameIdentity(reservedIdentity, completedDescriptor) ||
      !(await lstatMatchingRegularFile(destinationPath, reservedIdentity))
    ) {
      throw new DatabaseBackupError();
    }

    return {
      path: destinationPath,
      downloadName: safeDownloadName(options.now ?? new Date()),
      handle,
      size: completedDescriptor.size,
      remove: release,
    };
  } catch (error) {
    await release();
    if (error instanceof BackupInProgressError || error instanceof DatabaseBackupError) throw error;
    throw new DatabaseBackupError({ cause: error });
  }
}
