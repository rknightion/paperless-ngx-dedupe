import { mkdtemp, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  createDatabaseBackup: vi.fn(),
  claimDatabaseBackupLease: vi.fn<
    () => {
      recoveredOwnerId: string | null;
      leaseOwnerId: string;
      leaseToken: string;
      expiresAt: string;
    }
  >(() => ({
    recoveredOwnerId: null,
    leaseOwnerId: 'fresh_owner_0123456789abcdef',
    leaseToken: 'fresh_owner_0123456789abcdef',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  })),
  finalizeRecoveredDatabaseBackupLease: vi.fn(() => true),
  isDatabaseBackupLeaseOwner: vi.fn(() => true),
  renewDatabaseBackupLease: vi.fn(() => true),
  releaseDatabaseBackupLease: vi.fn(),
  removeStaleDatabaseBackupArtifact: vi.fn(async () => false),
  assertAccepting: vi.fn(),
  run: vi.fn(async (operation: () => Promise<Response>) => operation()),
}));

vi.mock('@paperless-dedupe/core/maintenance/backup', () => ({
  BackupInProgressError: class BackupInProgressError extends Error {},
  DatabaseBackupError: class DatabaseBackupError extends Error {},
  claimDatabaseBackupLease: mocks.claimDatabaseBackupLease,
  createDatabaseBackup: mocks.createDatabaseBackup,
  finalizeRecoveredDatabaseBackupLease: mocks.finalizeRecoveredDatabaseBackupLease,
  isDatabaseBackupLeaseOwner: mocks.isDatabaseBackupLeaseOwner,
  renewDatabaseBackupLease: mocks.renewDatabaseBackupLease,
  releaseDatabaseBackupLease: mocks.releaseDatabaseBackupLease,
  removeStaleDatabaseBackupArtifact: mocks.removeStaleDatabaseBackupArtifact,
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
}));

vi.mock('../../../../../runtime.server', () => ({
  getServerRuntime: vi.fn(async () => ({
    acceptingGate: {
      assertAccepting: mocks.assertAccepting,
      run: mocks.run,
    },
  })),
}));

import {
  BackupInProgressError,
  DatabaseBackupError,
} from '@paperless-dedupe/core/maintenance/backup';
import { OperationConflictError } from '@paperless-dedupe/core';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { GET } from './+server';

function sqliteHandle(privatePath?: string) {
  return {
    ...(privatePath ? { privatePath } : {}),
  };
}

async function artifactForFile(path: string, remove: () => Promise<void>) {
  const handle = await open(path, 'r');
  return {
    path,
    downloadName: 'paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3',
    handle,
    size: (await handle.stat()).size,
    remove: async () => {
      await handle.close();
      await remove();
    },
  };
}

describe('database backup API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run.mockImplementation(async (operation: () => Promise<Response>) => operation());
  });

  it('streams a deterministic private attachment and cleans it after completion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-test-'));
    const backupPath = join(directory, '.private-backup.sqlite3');
    await writeFile(backupPath, 'sqlite-backup-bytes', { mode: 0o600 });
    const remove = vi.fn(async () => {
      const { unlink } = await import('node:fs/promises');
      await unlink(backupPath);
    });
    mocks.createDatabaseBackup.mockResolvedValue(await artifactForFile(backupPath, remove));

    const response = await GET({
      locals: { sqlite: sqliteHandle('/srv/private/database.sqlite3') },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.sqlite3');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    await expect(response.text()).resolves.toBe('sqlite-backup-bytes');
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.claimDatabaseBackupLease).toHaveBeenCalledOnce();
    expect(mocks.releaseDatabaseBackupLease).toHaveBeenCalledOnce();
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans the artifact and lease when the client cancels the stream', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-abort-test-'));
    const backupPath = join(directory, '.private-backup.sqlite3');
    await writeFile(backupPath, Buffer.alloc(2 * 1024 * 1024, 1), { mode: 0o600 });
    const remove = vi.fn(async () => {
      const { unlink } = await import('node:fs/promises');
      await unlink(backupPath);
    });
    mocks.createDatabaseBackup.mockResolvedValue(await artifactForFile(backupPath, remove));

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel('client disconnected');

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(mocks.releaseDatabaseBackupLease).toHaveBeenCalledOnce();
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['process backup', new BackupInProgressError()],
    ['durable operation', new OperationConflictError('backup' as never)],
  ])('returns a safe conflict for an overlapping %s', async (_label, error) => {
    if (error instanceof OperationConflictError) {
      mocks.claimDatabaseBackupLease.mockImplementationOnce(() => {
        throw error;
      });
    } else {
      mocks.createDatabaseBackup.mockRejectedValueOnce(error);
    }

    const response = await GET({
      locals: { sqlite: sqliteHandle('/srv/secret/database.sqlite3') },
    } as never);
    const body = await response.text();

    expect(response.status).toBe(409);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: 'CONFLICT', operation: 'database_backup', retryable: true },
    });
    expect(body).not.toContain('/srv/secret');
  });

  it('rejects shutdown before creating a lease or backup', async () => {
    mocks.assertAccepting.mockImplementationOnce(() => {
      throw new RuntimeUnavailableError();
    });

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);

    expect(response.status).toBe(503);
    expect(mocks.claimDatabaseBackupLease).not.toHaveBeenCalled();
    expect(mocks.createDatabaseBackup).not.toHaveBeenCalled();
  });

  it('cleans the durable lease and returns a redacted failure', async () => {
    mocks.createDatabaseBackup.mockRejectedValueOnce(
      new DatabaseBackupError({ cause: new Error('/srv/private/database.sqlite3') }),
    );

    const response = await GET({
      locals: { sqlite: sqliteHandle('/srv/private/database.sqlite3') },
    } as never);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(mocks.releaseDatabaseBackupLease).toHaveBeenCalledOnce();
    expect(body).not.toContain('/srv/private');
  });

  it('removes only the expired owner artifact before creating the replacement backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-reclaim-test-'));
    const backupPath = join(directory, '.replacement.sqlite3');
    await writeFile(backupPath, 'replacement-backup');
    const remove = vi.fn(async () => {
      await unlink(backupPath);
    });
    mocks.claimDatabaseBackupLease.mockReturnValueOnce({
      recoveredOwnerId: 'expired_owner_0123456789abcdef',
      leaseOwnerId: 'replacement_owner_0123456789abc.recover.expired_owner_0123456789abcdef',
      leaseToken: 'replacement_owner_0123456789abc.recover.expired_owner_0123456789abcdef',
      expiresAt: '2026-07-24T12:00:30.000Z',
    });
    mocks.createDatabaseBackup.mockResolvedValue(await artifactForFile(backupPath, remove));

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);
    await response.arrayBuffer();

    expect(mocks.removeStaleDatabaseBackupArtifact).toHaveBeenCalledWith(
      expect.anything(),
      'expired_owner_0123456789abcdef',
    );
    expect(mocks.removeStaleDatabaseBackupArtifact.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalizeRecoveredDatabaseBackupLease.mock.invocationCallOrder[0]!,
    );
    expect(mocks.finalizeRecoveredDatabaseBackupLease.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createDatabaseBackup.mock.invocationCallOrder[0]!,
    );
  });

  it('heartbeats the owner lease while backup creation is still running', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-heartbeat-test-'));
    const backupPath = join(directory, '.heartbeat.sqlite3');
    await writeFile(backupPath, 'heartbeat-backup');
    const remove = vi.fn(async () => {
      await unlink(backupPath);
    });
    let finishBackup!: (artifact: Awaited<ReturnType<typeof artifactForFile>>) => void;
    mocks.createDatabaseBackup.mockReturnValueOnce(
      new Promise((resolve) => {
        finishBackup = resolve;
      }),
    );

    const responsePromise = GET({ locals: { sqlite: sqliteHandle() } } as never);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.renewDatabaseBackupLease).toHaveBeenCalledOnce();
    finishBackup(await artifactForFile(backupPath, remove));
    const response = await responsePromise;
    await response.arrayBuffer();
    vi.useRealTimers();
  });

  it('streams from the retained descriptor even when the artifact pathname does not resolve', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-descriptor-test-'));
    const descriptorPath = join(directory, 'descriptor.sqlite3');
    await writeFile(descriptorPath, 'descriptor-owned-bytes');
    const handle = await open(descriptorPath, 'r');
    const remove = vi.fn(async () => {
      await handle.close();
      await unlink(descriptorPath);
    });
    mocks.createDatabaseBackup.mockResolvedValue({
      path: join(directory, 'missing-path.sqlite3'),
      downloadName: 'paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3',
      handle,
      size: 22,
      remove,
    });

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);

    expect(response.headers.get('content-length')).toBe('22');
    await expect(response.text()).resolves.toBe('descriptor-owned-bytes');
    expect(remove).toHaveBeenCalledOnce();
  });

  it('cleans the descriptor artifact and lease when the retained stream errors', async () => {
    const remove = vi.fn(async () => undefined);
    const errorStream = new Readable({
      read() {
        this.destroy(new Error('simulated descriptor read failure'));
      },
    });
    mocks.createDatabaseBackup.mockResolvedValue({
      path: '/private/path-must-not-be-opened',
      downloadName: 'paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3',
      handle: { createReadStream: vi.fn(() => errorStream) },
      size: 1024,
      remove,
    });

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);

    await expect(response.arrayBuffer()).rejects.toThrow('simulated descriptor read failure');
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.releaseDatabaseBackupLease).toHaveBeenCalledOnce();
  });

  it('fences every stream pull against the current persisted lease token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'backup-route-fence-test-'));
    const backupPath = join(directory, '.fenced.sqlite3');
    await writeFile(backupPath, 'must-not-stream-after-reclaim');
    const remove = vi.fn(async () => {
      await unlink(backupPath);
    });
    mocks.createDatabaseBackup.mockResolvedValue(await artifactForFile(backupPath, remove));
    mocks.isDatabaseBackupLeaseOwner.mockReturnValueOnce(false);

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);

    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(mocks.isDatabaseBackupLeaseOwner).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(mocks.releaseDatabaseBackupLease).toHaveBeenCalledOnce();
  });

  it('rechecks the fencing token after an awaited descriptor read before enqueueing bytes', async () => {
    let releaseRead!: () => void;
    const readReleased = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const delayedStream = new Readable({
      async read() {
        await readReleased;
        this.push('must-not-cross-fence');
        this.push(null);
      },
    });
    const remove = vi.fn(async () => delayedStream.destroy());
    mocks.createDatabaseBackup.mockResolvedValue({
      path: '/private/path-must-not-be-opened',
      downloadName: 'paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3',
      handle: { createReadStream: vi.fn(() => delayedStream) },
      size: 20,
      remove,
    });
    mocks.isDatabaseBackupLeaseOwner.mockReturnValueOnce(true).mockReturnValue(false);

    const response = await GET({ locals: { sqlite: sqliteHandle() } } as never);
    const pendingRead = response.body!.getReader().read();
    await vi.waitFor(() => expect(mocks.isDatabaseBackupLeaseOwner).toHaveBeenCalledOnce());
    releaseRead();

    await expect(pendingRead).rejects.toThrow();
    expect(mocks.isDatabaseBackupLeaseOwner).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledOnce();
  });
});
