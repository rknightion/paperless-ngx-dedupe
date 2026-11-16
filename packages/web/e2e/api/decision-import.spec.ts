import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

test.beforeEach(({ seedDB }) => seedDB());
test.afterEach(({ clearDB }) => clearDB());
test('decision import previews without writing, restores statuses and rejects invalid or leased writes', async ({
  request,
}) => {
  const db = new Database(DB_PATH);
  try {
    db.exec(
      "UPDATE duplicate_group SET status=CASE WHEN id=(SELECT id FROM duplicate_group ORDER BY id LIMIT 1) THEN 'false_positive' ELSE 'ignored' END",
    );
    const expectedStatuses = db.prepare('SELECT id,status FROM duplicate_group ORDER BY id').all();
    expect(expectedStatuses.map((row) => (row as { status: string }).status)).toEqual([
      'false_positive',
      'ignored',
      'ignored',
    ]);
    const backup = await (await request.get('/api/v1/export/decisions.json')).json();
    db.exec("UPDATE duplicate_group SET status='pending'");
    const before = db.prepare('SELECT * FROM duplicate_group ORDER BY id').all();
    const preview = await request.post('/api/v1/import/decisions?dryRun=true', { data: backup });
    expect(preview.status()).toBe(200);
    expect(db.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(before);
    const result = await request.post('/api/v1/import/decisions', { data: backup });
    expect(result.status()).toBe(200);
    expect(await result.json()).toEqual(await preview.json());
    expect(db.prepare('SELECT id,status FROM duplicate_group ORDER BY id').all()).toEqual(
      expectedStatuses,
    );
    const after = db.prepare('SELECT * FROM duplicate_group ORDER BY id').all();
    await request.post('/api/v1/import/decisions', { data: backup });
    expect(db.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(after);
    for (const data of [
      { ...backup, version: 2 },
      {
        ...backup,
        pairDecisions: [
          [1, 2],
          [2, 2],
        ],
      },
    ]) {
      const response = await request.post('/api/v1/import/decisions', { data });
      expect(response.status()).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
      expect(db.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(after);
    }
    expect(
      (await request.post('/api/v1/import/decisions?dryRun=wrong', { data: backup })).status(),
    ).toBe(400);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO operation_lease (id,operation,owner_id,acquired_at,heartbeat_at,expires_at) VALUES ('blocking-delete','duplicate_delete','blocking-delete',?,?,?)",
    ).run(now, now, new Date(Date.now() + 60000).toISOString());
    for (const query of ['', '?dryRun=true'])
      expect(
        (await request.post(`/api/v1/import/decisions${query}`, { data: backup })).status(),
      ).toBe(409);
    expect(db.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(after);
  } finally {
    db.close();
  }
});
