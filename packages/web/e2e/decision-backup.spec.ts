import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from './fixtures/test-app';
test.beforeEach(({ seedDB }) => seedDB());
test.afterEach(({ clearDB }) => clearDB());
test('review decision backup previews before applying and exports a download', async ({
  page,
  request,
}) => {
  const db = new Database(DB_PATH);
  try {
    db.exec("UPDATE duplicate_group SET status='ignored'");
    const backup = await (await request.get('/api/v1/export/decisions.json')).json();
    db.exec("UPDATE duplicate_group SET status='pending'");
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'System & backup', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Review decision backup', exact: true });
    await panel.getByLabel('Review decisions file').setInputFiles({
      name: 'synthetic-decisions.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await panel.getByRole('button', { name: 'Preview decisions import', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('3 groups matched');
    expect(db.prepare('SELECT DISTINCT status FROM duplicate_group').all()).toEqual([
      { status: 'pending' },
    ]);
    await panel.getByRole('button', { name: 'Apply decisions import', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Imported');
    expect(db.prepare('SELECT DISTINCT status FROM duplicate_group').all()).toEqual([
      { status: 'ignored' },
    ]);
    const download = page.waitForEvent('download');
    await panel.getByRole('link', { name: 'Export decisions', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^paperless-ngx-dedupe-decisions-.*\.json$/,
    );
    await panel.getByLabel('Review decisions file').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
    await panel.getByRole('button', { name: 'Preview decisions import', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Apply decisions import', exact: true }),
    ).toHaveCount(0);
    expect(db.prepare('SELECT DISTINCT status FROM duplicate_group').all()).toEqual([
      { status: 'ignored' },
    ]);
  } finally {
    db.close();
  }
});
