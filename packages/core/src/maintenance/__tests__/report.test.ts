import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getMaintenanceReport } from '../report.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((database) => database.close()));

describe('getMaintenanceReport', () => {
  it('reports active leases, terminal job retention and SQLite storage without mutating state', () => {
    const sqlite = new Database(':memory:');
    databases.push(sqlite);
    sqlite.exec(`
      CREATE TABLE operation_lease (operation TEXT NOT NULL, owner_id TEXT NOT NULL, expires_at TEXT);
      CREATE TABLE job (status TEXT NOT NULL, completed_at TEXT);
      INSERT INTO operation_lease VALUES ('backup', 'backup-job', '2026-07-24T11:00:00.000Z');
      INSERT INTO job VALUES ('completed', '2026-07-01T00:00:00.000Z'), ('failed', '2026-07-23T00:00:00.000Z');
    `);

    expect(getMaintenanceReport(sqlite, new Date('2026-07-24T10:00:00.000Z'))).toMatchObject({
      activeLeases: [{ operation: 'backup', ownerId: 'backup-job' }],
      terminalJobs: { total: 2, olderThanThirtyDays: 0 },
      storage: { pageCount: expect.any(Number), freePageCount: expect.any(Number) },
    });
    expect(sqlite.prepare('SELECT count(*) AS count FROM operation_lease').get()).toEqual({
      count: 1,
    });
  });
});
