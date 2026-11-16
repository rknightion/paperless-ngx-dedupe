import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

test('decision export is a portable JSON attachment without document content', async ({
  seedDB,
  clearDB,
  request,
}) => {
  const seed = seedDB();
  const db = new Database(DB_PATH);
  try {
    db.prepare("UPDATE duplicate_group SET status='false_positive' WHERE id=?").run(
      seed.groupIds[0],
    );
    db.prepare("UPDATE duplicate_group SET status='ignored' WHERE id=?").run(seed.groupIds[1]);
    db.prepare("UPDATE duplicate_group SET status='deleted' WHERE id=?").run(seed.groupIds[2]);
    db.prepare(
      "INSERT INTO duplicate_pair_decision (id,paperless_id_low,paperless_id_high,decision,source,created_at) VALUES ('export-pair',999,1000,'not_duplicate','manual','2024-01-01')",
    ).run();
    const expected = seed.groupIds
      .slice(0, 2)
      .sort()
      .map((id) => {
        const group = db
          .prepare('SELECT status,updated_at FROM duplicate_group WHERE id=?')
          .get(id) as { status: string; updated_at: string };
        const members = db
          .prepare(
            'SELECT d.paperless_id FROM duplicate_member m JOIN document d ON d.id=m.document_id WHERE m.group_id=? ORDER BY d.paperless_id',
          )
          .all(id) as { paperless_id: number }[];
        return {
          paperlessIds: members.map((member) => member.paperless_id),
          status: group.status,
          decidedAt: group.updated_at,
        };
      });
    const response = await request.get('/api/v1/export/decisions.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['content-disposition']).toMatch(
      /^attachment; filename="paperless-ngx-dedupe-decisions-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(await response.json()).toEqual({
      version: 1,
      exportedAt: expect.any(String),
      groups: expected,
      pairDecisions: [[999, 1000]],
    });
  } finally {
    db.close();
    clearDB();
  }
});
