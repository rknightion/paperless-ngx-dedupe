import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BackupInProgressError,
  claimDatabaseBackupLease,
  createDatabaseBackup,
  finalizeRecoveredDatabaseBackupLease,
  isDatabaseBackupLeaseOwner,
  renewDatabaseBackupLease,
  type DatabaseBackupArtifact,
} from '../backup.js';
import { OperationConflictError } from '../../scheduler/coordinator.js';

const openDatabases: Database.Database[] = [];
const artifacts: DatabaseBackupArtifact[] = [];

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'paperless-dedupe-backup-test-'));
}

function openDatabase(path: string): Database.Database {
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  openDatabases.push(database);
  return database;
}

function createLeaseTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE operation_lease (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      heartbeat_at TEXT,
      expires_at TEXT
    );
    CREATE UNIQUE INDEX operation_lease_operation_unique
      ON operation_lease(operation);
  `);
}

function waitForChildMessage<T>(
  child: ChildProcess,
  predicate: (message: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for backup process')),
      10_000,
    );
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      reject(new Error(`Backup process exited before its receipt (${code ?? signal})`));
    });
    child.on('message', (message: T) => {
      if (!predicate(message)) return;
      clearTimeout(timeout);
      resolve(message);
    });
  });
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

afterEach(async () => {
  await Promise.allSettled(artifacts.splice(0).map((artifact) => artifact.remove()));
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
});

describe('consistent database backup', () => {
  it('produces an integral snapshot with the exact schema while the source mutates', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'application.sqlite3');
    const source = openDatabase(sourcePath);
    const writer = openDatabase(sourcePath);
    source.exec(`
      CREATE TABLE document (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE INDEX document_title_idx ON document(title);
    `);
    const insert = source.prepare('INSERT INTO document (title) VALUES (?)');
    const seed = source.transaction(() => {
      for (let index = 0; index < 4_000; index += 1) {
        insert.run(`seed-${index}-${'x'.repeat(512)}`);
      }
    });
    seed();

    let mutated = false;
    const artifact = await createDatabaseBackup(source, {
      ownerId: 'owner_mutation_0123456789abcdef',
      progress: () => {
        if (!mutated) {
          mutated = true;
          writer.exec(`
            CREATE TABLE source_mutation (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO source_mutation (value) VALUES ('during-backup');
          `);
        }
        return 8;
      },
    });
    artifacts.push(artifact);

    const destination = openDatabase(artifact.path);
    expect(destination.pragma('integrity_check', { simple: true })).toBe('ok');
    const readSchema = (database: Database.Database) =>
      database
        .prepare(
          `SELECT type, name, tbl_name, sql
           FROM sqlite_master
           WHERE name NOT LIKE 'sqlite_%'
           ORDER BY type, name`,
        )
        .all();
    expect(readSchema(destination)).toEqual(readSchema(source));
    expect(
      destination.prepare('SELECT value FROM source_mutation WHERE id = 1').pluck().get(),
    ).toBe('during-backup');
  });

  it('allows only one in-process backup at a time', async () => {
    const directory = await temporaryDirectory();
    const source = openDatabase(join(directory, 'application.sqlite3'));
    source.exec('CREATE TABLE payload (value BLOB)');
    source.prepare('INSERT INTO payload (value) VALUES (zeroblob(?))').run(4 * 1024 * 1024);

    let firstProgressSeen!: () => void;
    const progressSeen = new Promise<void>((resolve) => {
      firstProgressSeen = resolve;
    });
    let released = false;
    const first = createDatabaseBackup(source, {
      ownerId: 'owner_process_a_0123456789abcd',
      progress: () => {
        firstProgressSeen();
        return released ? 100 : 0;
      },
    });
    await progressSeen;

    await expect(
      createDatabaseBackup(source, { ownerId: 'owner_process_b_0123456789abcd' }),
    ).rejects.toBeInstanceOf(BackupInProgressError);
    released = true;
    const artifact = await first;
    artifacts.push(artifact);
  });

  it('places a random private temporary file beside the resolved source and removes it idempotently', async () => {
    const realDirectory = await temporaryDirectory();
    const linkedDirectory = await temporaryDirectory();
    const sourcePath = join(realDirectory, 'application.sqlite3');
    const source = openDatabase(sourcePath);
    source.exec('CREATE TABLE value (id INTEGER PRIMARY KEY)');
    const linkPath = join(linkedDirectory, 'linked.sqlite3');
    await symlink(sourcePath, linkPath);
    const linkedSource = openDatabase(linkPath);

    const artifact = await createDatabaseBackup(linkedSource, {
      ownerId: 'owner_symlink_0123456789abcdef',
      now: new Date('2026-07-24T12:34:56.789Z'),
    });
    artifacts.push(artifact);

    expect(dirname(artifact.path)).toBe(await realpath(realDirectory));
    expect(basename(artifact.path)).toMatch(
      /^\.paperless-ngx-dedupe-backup-owner_symlink_0123456789abcdef\.sqlite3$/,
    );
    expect(artifact.downloadName).toBe(
      'paperless-ngx-dedupe-backup-2026-07-24T12-34-56-789Z.sqlite3',
    );
    expect((await stat(artifact.path)).mode & 0o777).toBe(0o600);
    await artifact.remove();
    await expect(artifact.remove()).resolves.toBeUndefined();
    expect(await readdir(realDirectory)).not.toContain(basename(artifact.path));
  });

  it('removes its private destination and releases the lock when backup fails', async () => {
    const directory = await temporaryDirectory();
    const source = openDatabase(join(directory, 'application.sqlite3'));
    source.exec('CREATE TABLE value (id INTEGER PRIMARY KEY)');
    const originalBackup = source.backup.bind(source);
    source.backup = (() =>
      Promise.reject(new Error('simulated backup failure'))) as typeof source.backup;

    await expect(
      createDatabaseBackup(source, { ownerId: 'owner_failure_a_0123456789abcdef' }),
    ).rejects.toThrow('Database backup failed');
    expect(
      (await readdir(directory)).filter((name) => name.startsWith('.paperless-ngx-dedupe-backup-')),
    ).toEqual([]);

    source.backup = originalBackup;
    const artifact = await createDatabaseBackup(source, {
      ownerId: 'owner_failure_b_0123456789abcdef',
    });
    artifacts.push(artifact);
  });

  it('atomically reclaims an expired lease, heartbeats it, and preserves VACUUM conflicts', async () => {
    const directory = await temporaryDirectory();
    const sqlite = openDatabase(join(directory, 'lease.sqlite3'));
    createLeaseTable(sqlite);
    const first = claimDatabaseBackupLease(
      sqlite,
      'owner_lease_a_0123456789abcdef',
      new Date('2026-07-24T12:00:00.000Z'),
      1_000,
    );
    expect(first.recoveredOwnerId).toBeNull();

    expect(() =>
      claimDatabaseBackupLease(
        sqlite,
        'owner_lease_b_0123456789abcdef',
        new Date('2026-07-24T12:00:00.500Z'),
        1_000,
      ),
    ).toThrow(OperationConflictError);
    expect(
      renewDatabaseBackupLease(
        sqlite,
        'owner_lease_a_0123456789abcdef',
        new Date('2026-07-24T12:00:00.750Z'),
        1_000,
      ),
    ).toBe(true);
    expect(() =>
      claimDatabaseBackupLease(
        sqlite,
        'owner_lease_b_0123456789abcdef',
        new Date('2026-07-24T12:00:01.500Z'),
        1_000,
      ),
    ).toThrow(OperationConflictError);

    const reclaimed = claimDatabaseBackupLease(
      sqlite,
      'owner_lease_b_0123456789abcdef',
      new Date('2026-07-24T12:00:01.751Z'),
      1_000,
    );
    expect(reclaimed.recoveredOwnerId).toBe('owner_lease_a_0123456789abcdef');
    expect(reclaimed.leaseToken).not.toBe('owner_lease_a_0123456789abcdef');
    expect(
      renewDatabaseBackupLease(
        sqlite,
        'owner_lease_a_0123456789abcdef',
        new Date('2026-07-24T12:00:01.752Z'),
        1_000,
      ),
    ).toBe(false);
    expect(
      isDatabaseBackupLeaseOwner(
        sqlite,
        'owner_lease_a_0123456789abcdef',
        new Date('2026-07-24T12:00:01.752Z'),
      ),
    ).toBe(false);
    expect(
      isDatabaseBackupLeaseOwner(
        sqlite,
        reclaimed.leaseToken,
        new Date('2026-07-24T12:00:01.752Z'),
      ),
    ).toBe(true);
    expect(
      finalizeRecoveredDatabaseBackupLease(
        sqlite,
        reclaimed.leaseToken,
        'owner_lease_b_0123456789abcdef',
        new Date('2026-07-24T12:00:01.751Z'),
        1_000,
      ),
    ).toBe(true);
    expect(
      sqlite
        .prepare(
          `SELECT owner_id AS ownerId, heartbeat_at AS heartbeatAt, expires_at AS expiresAt
           FROM operation_lease WHERE operation = 'backup'`,
        )
        .get(),
    ).toEqual({
      ownerId: 'owner_lease_b_0123456789abcdef',
      heartbeatAt: '2026-07-24T12:00:01.751Z',
      expiresAt: '2026-07-24T12:00:02.751Z',
    });

    sqlite.prepare(`DELETE FROM operation_lease WHERE operation = 'backup'`).run();
    sqlite
      .prepare(
        `INSERT INTO operation_lease
          (id, operation, owner_id, acquired_at, heartbeat_at, expires_at)
         VALUES ('vacuum-id', 'vacuum', 'vacuum-owner', ?, ?, NULL)`,
      )
      .run('2026-07-24T12:00:02.000Z', '2026-07-24T12:00:02.000Z');
    expect(() =>
      claimDatabaseBackupLease(
        sqlite,
        'owner_lease_c_0123456789abcdef',
        new Date('2026-07-24T12:00:03.000Z'),
        1_000,
      ),
    ).toThrow(OperationConflictError);
    expect(
      sqlite.prepare(`SELECT owner_id FROM operation_lease WHERE operation = 'vacuum'`).get(),
    ).toEqual({ owner_id: 'vacuum-owner' });
  });

  it('retains one verified no-follow descriptor and never streams or deletes a swapped file', async () => {
    const directory = await temporaryDirectory();
    const source = openDatabase(join(directory, 'application.sqlite3'));
    source.exec("CREATE TABLE safe_backup (value TEXT); INSERT INTO safe_backup VALUES ('safe')");
    const artifact = await createDatabaseBackup(source, {
      ownerId: 'owner_descriptor_0123456789abcdef',
    });
    artifacts.push(artifact);
    const displacedBackup = `${artifact.path}.displaced`;
    await rename(artifact.path, displacedBackup);
    await writeFile(artifact.path, 'foreign-file-must-survive');

    const bytes = await artifact.handle.readFile();
    expect(bytes.subarray(0, 16).toString()).toBe('SQLite format 3\u0000');
    expect(bytes.byteLength).toBe(artifact.size);
    await artifact.remove();

    expect(await readFile(artifact.path, 'utf8')).toBe('foreign-file-must-survive');
  });

  it.each(['symlink', 'file'] as const)(
    'rejects a %s swapped in after backup before descriptor verification without touching its target',
    async (kind) => {
      const directory = await temporaryDirectory();
      const source = openDatabase(join(directory, 'application.sqlite3'));
      source.exec('CREATE TABLE safe_backup (value TEXT)');
      const target = join(directory, 'foreign-target');
      await writeFile(target, 'foreign-target-must-survive');
      const originalBackup = source.backup.bind(source);
      source.backup = (async (path, options) => {
        const result = await originalBackup(path, options);
        await rename(path, `${path}.real-backup`);
        if (kind === 'symlink') await symlink(target, path);
        else await writeFile(path, 'foreign-replacement-must-survive');
        return result;
      }) as typeof source.backup;

      await expect(
        createDatabaseBackup(source, {
          ownerId: `owner_swap_${kind}_0123456789abcdef`,
        }),
      ).rejects.toThrow('Database backup failed');
      expect(await readFile(target, 'utf8')).toBe('foreign-target-must-survive');
      if (kind === 'file') {
        expect(
          await readFile(
            join(
              directory,
              `.paperless-ngx-dedupe-backup-owner_swap_file_0123456789abcdef.sqlite3`,
            ),
            'utf8',
          ),
        ).toBe('foreign-replacement-must-survive');
      }
    },
  );

  it('recovers an expired lease and owner-bound artifact after a real process dies mid-download', async () => {
    const directory = await temporaryDirectory();
    const databasePath = join(directory, 'application.sqlite3');
    const parent = openDatabase(databasePath);
    createLeaseTable(parent);
    parent.exec(`
      CREATE TABLE source_payload (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO source_payload (value) VALUES ('safe-source');
    `);
    const foreignPath = join(
      directory,
      '.paperless-ngx-dedupe-backup-foreign_owner_0123456789abcdef.sqlite3',
    );
    const foreign = openDatabase(foreignPath);
    foreign.exec(
      `CREATE TABLE foreign_file (marker TEXT); INSERT INTO foreign_file VALUES ('keep')`,
    );
    foreign.close();
    openDatabases.splice(openDatabases.indexOf(foreign), 1);

    const fixture = new URL('./fixtures/backup-process.ts', import.meta.url);
    const leaseDurationMs = 600;
    const crashedOwner = 'crashed_owner_0123456789abcdef';
    const replacementOwner = 'replacement_owner_0123456789abc';
    const crashed = fork(
      fixture,
      ['hold', databasePath, crashedOwner, String(leaseDurationMs), foreignPath],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    const midDownload = await waitForChildMessage<{
      stage: string;
      path: string;
      header: string;
    }>(crashed, (message) => message.stage === 'mid-download');
    expect(midDownload.header).toBe('SQLite format 3\u0000');
    crashed.kill('SIGKILL');
    await new Promise<void>((resolve) => crashed.once('exit', () => resolve()));

    const replacement = fork(
      fixture,
      ['recover', databasePath, replacementOwner, String(leaseDurationMs), foreignPath],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    const replacementExit = waitForChildExit(replacement);
    const recovered = await waitForChildMessage<{
      stage: string;
      recoveredOwnerId: string;
      conflicts: number;
      staleRemoved: boolean;
      integrity: string;
      foreignMarker: string;
    }>(replacement, (message) => message.stage === 'recovered');
    await replacementExit;

    expect(recovered).toMatchObject({
      recoveredOwnerId: crashedOwner,
      staleRemoved: true,
      integrity: 'ok',
      foreignMarker: 'keep',
    });
    expect(recovered.conflicts).toBeGreaterThan(0);
    await expect(readFile(midDownload.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(foreignPath)).not.toHaveLength(0);
  }, 15_000);

  it('atomically fences a SIGSTOPed owner before reclaim cleanup and prevents resumed streaming', async () => {
    const directory = await temporaryDirectory();
    const databasePath = join(directory, 'application.sqlite3');
    const parent = openDatabase(databasePath);
    createLeaseTable(parent);
    parent.exec(`
      CREATE TABLE source_payload (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO source_payload (value) VALUES ('safe-source');
    `);
    const foreignPath = join(
      directory,
      '.paperless-ngx-dedupe-backup-foreign_pause_0123456789abcd.sqlite3',
    );
    const foreign = openDatabase(foreignPath);
    foreign.exec(
      `CREATE TABLE foreign_file (marker TEXT); INSERT INTO foreign_file VALUES ('keep')`,
    );
    foreign.close();
    openDatabases.splice(openDatabases.indexOf(foreign), 1);

    const fixture = new URL('./fixtures/backup-process.ts', import.meta.url);
    const leaseDurationMs = 600;
    const pausedOwner = 'paused_owner_0123456789abcdefg';
    const replacementOwner = 'fencing_owner_0123456789abcdef';
    const paused = fork(
      fixture,
      ['hold', databasePath, pausedOwner, String(leaseDurationMs), foreignPath],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    const midDownload = await waitForChildMessage<{ stage: string }>(
      paused,
      (message) => message.stage === 'mid-download',
    );
    expect(midDownload.stage).toBe('mid-download');
    paused.kill('SIGSTOP');

    const replacement = fork(
      fixture,
      ['recover-hold', databasePath, replacementOwner, String(leaseDurationMs), foreignPath],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    const recovered = await waitForChildMessage<{
      stage: string;
      recoveredOwnerId: string;
      conflicts: number;
    }>(replacement, (message) => message.stage === 'recovered');
    expect(recovered.recoveredOwnerId).toBe(pausedOwner);
    expect(recovered.conflicts).toBeGreaterThan(0);
    expect(
      parent
        .prepare(`SELECT owner_id FROM operation_lease WHERE operation = 'backup'`)
        .pluck()
        .get(),
    ).toBe(replacementOwner);

    paused.send({ action: 'verify-fence' });
    paused.kill('SIGCONT');
    const fenced = await waitForChildMessage<{
      stage: string;
      oldCanRenew: boolean;
      oldOwns: boolean;
      bytesReadAfterResume: number;
    }>(paused, (message) => message.stage === 'fenced');
    expect(fenced).toMatchObject({
      oldCanRenew: false,
      oldOwns: false,
      bytesReadAfterResume: 0,
    });

    const replacementExit = waitForChildExit(replacement);
    replacement.send({ action: 'cleanup' });
    await replacementExit;
    const pausedExit = waitForChildExit(paused);
    paused.send({ action: 'cleanup' });
    await pausedExit;
  }, 15_000);
});
