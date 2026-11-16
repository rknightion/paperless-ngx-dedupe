import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';
test.beforeEach(({ seedDB }) => seedDB());
test.afterEach(({ clearDB }) => clearDB());
test('keeper preview is read-only and apply respects provenance, status, count and operation lease', async ({
  request,
}) => {
  const db = new Database(DB_PATH);
  try {
    const groups = db.prepare('SELECT id FROM duplicate_group ORDER BY id').all() as {
      id: string;
    }[];
    db.exec(
      "UPDATE document SET added_date=printf('2024-01-%02d',paperless_id); UPDATE duplicate_group SET status='pending',primary_source='auto'",
    );
    db.prepare("UPDATE duplicate_group SET primary_source='manual' WHERE id=?").run(groups[1].id);
    db.prepare("UPDATE duplicate_group SET status='ignored' WHERE id=?").run(groups[2].id);
    const snapshot = () => ({
      groups: db.prepare('SELECT * FROM duplicate_group ORDER BY id').all(),
      members: db.prepare('SELECT * FROM duplicate_member ORDER BY id').all(),
      leases: db.prepare('SELECT * FROM operation_lease').all(),
    });
    const before = snapshot();
    const data = { strategy: 'newest_added' };
    const preview = await request.post('/api/v1/duplicates/primary/preview', { data });
    expect(preview.status()).toBe(200);
    const { data: plan } = await preview.json();
    expect(plan.groupsEvaluated).toBe(1);
    expect(plan.groupsChanging).toBe(1);
    expect(plan.sample[0].groupId).toBe(groups[0].id);
    expect(plan.sample[0].proposed.paperlessId).toBeGreaterThan(plan.sample[0].current.paperlessId);
    expect(snapshot()).toEqual(before);
    const stale = await request.post('/api/v1/duplicates/primary/apply', {
      data: { ...data, expectedChanging: 2 },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe('CONFLICT');
    expect(snapshot()).toEqual(before);
    const applied = await request.post('/api/v1/duplicates/primary/apply', {
      data: { ...data, expectedChanging: 1 },
    });
    expect(await applied.json()).toEqual({ data: { updated: 1 } });
    expect(
      db
        .prepare(
          'SELECT d.paperless_id FROM duplicate_member m JOIN document d ON d.id=m.document_id WHERE m.group_id=? AND m.is_primary=1',
        )
        .get(groups[0].id),
    ).toEqual({ paperless_id: plan.sample[0].proposed.paperlessId });
    expect(
      db.prepare('SELECT * FROM duplicate_member WHERE group_id=? ORDER BY id').all(groups[1].id),
    ).toEqual(
      (before.members as { group_id: string }[]).filter((row) => row.group_id === groups[1].id),
    );
    const manual = await request.post('/api/v1/duplicates/primary/apply', {
      data: { ...data, includeManual: true, expectedChanging: 1 },
    });
    expect(await manual.json()).toEqual({ data: { updated: 1 } });
    expect(
      db.prepare('SELECT * FROM duplicate_member WHERE group_id=? ORDER BY id').all(groups[2].id),
    ).toEqual(
      (before.members as { group_id: string }[]).filter((row) => row.group_id === groups[2].id),
    );
    for (const body of [
      { strategy: 'unknown' },
      { strategy: 'lowest_id', minConfidence: 2 },
      { strategy: 'lowest_id', includeManual: 'yes' },
    ])
      expect(
        (await request.post('/api/v1/duplicates/primary/preview', { data: body })).status(),
      ).toBe(400);
    expect((await request.post('/api/v1/duplicates/primary/apply', { data })).status()).toBe(400);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO operation_lease (id,operation,owner_id,acquired_at,heartbeat_at,expires_at) VALUES ('blocking-delete','duplicate_delete','blocking-delete',?,?,?)",
    ).run(now, now, new Date(Date.now() + 60000).toISOString());
    const locked = snapshot();
    for (const action of ['preview', 'apply'])
      expect(
        (
          await request.post(`/api/v1/duplicates/primary/${action}`, {
            data: { ...data, ...(action === 'apply' ? { expectedChanging: 0 } : {}) },
          })
        ).status(),
      ).toBe(409);
    expect(snapshot()).toEqual(locked);
  } finally {
    db.close();
  }
});
