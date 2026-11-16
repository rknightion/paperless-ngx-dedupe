import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

for (const purged of [false, true])
  test(`restore a completed deletion run through the worker, purged=${purged}`, async ({
    request,
    seedDB,
    clearDB,
  }) => {
    const seed = seedDB();
    await request.post('http://localhost:18923/__control__/reset');
    const db = new Database(DB_PATH);
    try {
      const initial = await request.get('/api/v1/batch/deletions');
      expect(initial.status()).toBe(200);
      expect((await initial.json()).data).toEqual([]);
      expect((await request.get('/api/v1/batch/deletions?limit=0')).status()).toBe(400);
      expect((await request.post('/api/v1/batch/deletions/missing/restore')).status()).toBe(404);
      const preview = await request.post('/api/v1/batch/delete-non-primary/preview', {
        data: { groupIds: [seed.groupIds[0]] },
      });
      expect(preview.status()).toBe(200);
      const deleted = await request.post('/api/v1/batch/delete-non-primary', {
        data: { planToken: (await preview.json()).data.planToken, confirm: true },
      });
      expect(deleted.status()).toBe(202);
      const deletionId = (await deleted.json()).data.jobId;
      await expect
        .poll(
          async () => (await (await request.get(`/api/v1/jobs/${deletionId}`)).json()).data.status,
          { timeout: 15000 },
        )
        .toBe('completed');
      const runs = await request.get('/api/v1/batch/deletions?limit=20');
      expect(runs.status()).toBe(200);
      const [run] = (await runs.json()).data;
      expect(run).toEqual({
        planId: expect.any(String),
        completedAt: expect.any(String),
        documentsDeleted: 1,
        groups: [seed.groupIds[0]],
      });
      expect(db.prepare('SELECT id FROM document WHERE paperless_id=2').get()).toBeUndefined();
      const beforeJobs = db.prepare('SELECT id FROM job ORDER BY id').all();
      db.prepare(
        "INSERT INTO operation_lease (id,operation,owner_id,acquired_at,heartbeat_at,expires_at) VALUES ('blocking-delete','duplicate_delete','blocking-delete',?,?,?)",
      ).run('2026-01-01', '2026-01-01', '2099-01-01');
      const conflict = await request.post(`/api/v1/batch/deletions/${run.planId}/restore`);
      expect(conflict.status()).toBe(409);
      expect((await conflict.json()).error.code).toBe('JOB_ALREADY_RUNNING');
      expect(db.prepare('SELECT id FROM job ORDER BY id').all()).toEqual(beforeJobs);
      db.prepare("DELETE FROM operation_lease WHERE owner_id='blocking-delete'").run();
      if (purged)
        expect(
          (await request.post('/api/v1/paperless/trash', { data: { action: 'empty' } })).status(),
        ).toBe(200);
      const response = await request.post(`/api/v1/batch/deletions/${run.planId}/restore`);
      expect(response.status()).toBe(202);
      const jobId = (await response.json()).data.jobId;
      await expect
        .poll(async () => (await (await request.get(`/api/v1/jobs/${jobId}`)).json()).data.status, {
          timeout: 15000,
        })
        .toBe('completed');
      const job = (await (await request.get(`/api/v1/jobs/${jobId}`)).json()).data;
      expect(job.type).toBe('duplicate_restore');
      expect(JSON.parse(job.resultJson)).toEqual({
        restored: purged ? 0 : 1,
        notRestorable: purged ? 1 : 0,
      });
      if (purged)
        expect(db.prepare('SELECT id FROM document WHERE paperless_id=2').get()).toBeUndefined();
      else {
        expect(
          db.prepare('SELECT title,modified_date FROM document WHERE paperless_id=2').get(),
        ).toEqual({ title: 'Test Document 2', modified_date: '2024-02-03T00:00:00Z' });
        expect(
          db
            .prepare(
              'SELECT full_text FROM document_content c JOIN document d ON d.id=c.document_id WHERE d.paperless_id=2',
            )
            .get(),
        ).toEqual({ full_text: expect.stringContaining('test document 2') });
      }
      expect(
        db.prepare('SELECT status FROM duplicate_group WHERE id=?').get(seed.groupIds[0]),
      ).toEqual({ status: 'deleted' });
    } finally {
      db.close();
      clearDB();
      await request.post('http://localhost:18923/__control__/reset');
    }
  });
