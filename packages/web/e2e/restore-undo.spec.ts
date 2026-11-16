import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from './fixtures/test-app';

for (const surface of ['detail', 'bulk', 'wizard', 'deleted queue'])
  test(`confirmed Undo restores from the ${surface}`, async ({
    page,
    request,
    seedDB,
    clearDB,
  }) => {
    const seed = seedDB();
    const db = new Database(DB_PATH);
    await request.post('http://localhost:18923/__control__/reset');
    try {
      if (surface === 'deleted queue') {
        const preview = await request.post('/api/v1/batch/delete-non-primary/preview', {
          data: { groupIds: [seed.groupIds[0]] },
        });
        const response = await request.post('/api/v1/batch/delete-non-primary', {
          data: { planToken: (await preview.json()).data.planToken, confirm: true },
        });
        const jobId = (await response.json()).data.jobId;
        await expect
          .poll(
            async () => (await (await request.get(`/api/v1/jobs/${jobId}`)).json()).data.status,
            { timeout: 15000 },
          )
          .toBe('completed');
        await page.goto('/duplicates?queue=deleted');
      } else if (surface === 'wizard') {
        await page.goto('/duplicates/wizard');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText('Review Matching Groups', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.locator('div.font-medium', { hasText: 'Delete Non-Primary Documents' }).click();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.getByLabel('I understand this action affects 1 groups').check();
        await page
          .getByLabel(
            'I understand deleted documents will be moved to the Paperless-NGX recycle bin',
          )
          .check();
        await page.getByRole('button', { name: 'Execute', exact: true }).click();
        await expect(page.getByText('Operation Complete', { exact: true })).toBeVisible({
          timeout: 15000,
        });
      } else if (surface === 'detail') {
        await page.goto(`/duplicates/${seed.groupIds[0]}`);
        await page.getByRole('button', { name: 'Delete Duplicates', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Delete Non-Primary Documents', exact: true })
          .getByRole('button', { name: 'Delete Documents', exact: true })
          .click();
        await expect(page.getByText('Paperless-NGX Recycle Bin', { exact: true })).toBeVisible({
          timeout: 15000,
        });
      } else {
        await page.goto('/duplicates');
        await page.locator('tbody tr').first().locator('input[type=checkbox]').check();
        await page.getByRole('button', { name: 'Delete Non-Primary', exact: true }).click();
        const preview = page.getByRole('dialog', {
          name: 'Review documents to delete',
          exact: true,
        });
        await preview.getByLabel('I reviewed this exact deletion list').check();
        await preview.getByRole('button', { name: 'Delete 1 document', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Confirm deletion of reviewed documents', exact: true })
          .getByRole('button', { name: 'Move documents to recycle bin', exact: true })
          .click();
        await expect(page.getByText('Delete complete', { exact: true })).toBeVisible({
          timeout: 15000,
        });
      }
      expect(db.prepare('SELECT id FROM document WHERE paperless_id=2').get()).toBeUndefined();
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      await expect(undo).toHaveCount(1);
      const before = db
        .prepare("SELECT COUNT(*) AS count FROM job WHERE type='duplicate_restore'")
        .get();
      await undo.click();
      const confirm = page.getByRole('dialog', { name: 'Restore deletion run', exact: true });
      await expect(confirm).toContainText('entire deletion run');
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM job WHERE type='duplicate_restore'").get(),
      ).toEqual(before);
      await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(confirm).not.toBeVisible();
      if (surface === 'deleted queue') {
        await page.route('**/api/v1/batch/deletions/*/restore', (route) =>
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'JOB_ALREADY_RUNNING' } }),
          }),
        );
        await undo.click();
        await confirm.getByRole('button', { name: 'Restore documents', exact: true }).click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'A document operation is already running' }),
        ).toBeVisible();
        expect(
          db.prepare("SELECT COUNT(*) AS count FROM job WHERE type='duplicate_restore'").get(),
        ).toEqual(before);
        await page.unroute('**/api/v1/batch/deletions/*/restore');
      }

      await undo.click();
      await confirm.getByRole('button', { name: 'Restore documents', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Restored 1 document' })).toBeVisible(
        { timeout: 15000 },
      );
      expect(db.prepare('SELECT title FROM document WHERE paperless_id=2').get()).toEqual({
        title: 'Test Document 2',
      });
      expect(
        db.prepare('SELECT status FROM duplicate_group WHERE id=?').get(seed.groupIds[0]),
      ).toEqual({ status: 'deleted' });
      if (surface === 'wizard') {
        await undo.click();
        await confirm.getByRole('button', { name: 'Restore documents', exact: true }).click();
        await expect(
          page.getByRole('status').filter({
            hasText: 'Nothing to restore. 1 document is no longer in the recycle bin.',
          }),
        ).toBeVisible({ timeout: 15000 });
      }
    } finally {
      db.close();
      clearDB();
      await request.post('http://localhost:18923/__control__/reset');
    }
  });
