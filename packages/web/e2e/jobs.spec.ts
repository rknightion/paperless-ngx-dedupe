import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from './fixtures/test-app';

test.describe('Job history', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
    const db = new Database(DB_PATH);
    const insert = db.prepare(
      `INSERT INTO job (
         id, type, status, progress, attempt, created_at, public_history_key
       ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
    );
    db.transaction(() => {
      for (let index = 0; index < 60; index += 1) {
        insert.run(
          `history-${String(index).padStart(2, '0')}`,
          index % 2 === 0 ? 'sync' : 'analysis',
          index % 3 === 0 ? 'failed' : 'completed',
          '2026-07-23T12:00:00.000Z',
          index.toString(16).padStart(32, '0'),
        );
      }
    })();
    db.close();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('keeps filters in the URL and advances through stable cursor pages', async ({ page }) => {
    await page.goto('/jobs?type=sync&status=completed&pageSize=10');

    await expect(page.getByLabel('Type')).toHaveValue('sync');
    await expect(page.getByLabel('Status')).toHaveValue('completed');
    await expect(page.getByLabel('Jobs per page')).toHaveValue('10');
    const firstPageIds = await page
      .locator('[data-job-key]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-job-key')));
    expect(firstPageIds).toHaveLength(10);

    const next = page.getByRole('link', { name: 'Next page' });
    await expect(next).toHaveAttribute('href', /type=sync/);
    await expect(next).toHaveAttribute('href', /status=completed/);
    await expect(next).toHaveAttribute('href', /pageSize=10/);
    await expect(next).toHaveAttribute('href', /cursor=/);
    await next.click();
    await page.waitForURL(/cursor=/);

    const secondPageIds = await page
      .locator('[data-job-key]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-job-key')));
    expect(secondPageIds).toHaveLength(10);
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);

    await page.getByLabel('Status').selectOption('failed');
    await expect(page).toHaveURL(/status=failed/);
    await expect(page).not.toHaveURL(/cursor=/);
  });

  test('filter controls are keyboard reachable and the mobile view does not overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/jobs?pageSize=10');

    await page.getByLabel('Type').focus();
    await expect(page.getByLabel('Type')).toBeFocused();
    await expect(page.getByRole('option', { name: 'Paused' })).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Status')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Jobs per page')).toBeFocused();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test('announces cleanup results from the full safe aggregate', async ({ page }) => {
    await page.goto('/jobs?status=pending&pageSize=10');
    const clear = page.getByRole('button', { name: 'Clear History' });
    await expect(clear).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await clear.click();

    await expect(page.getByRole('status')).toContainText(/Cleared \d+ jobs/);
  });

  test('cursor API exposes only the bounded public job projection', async ({ request }) => {
    const response = await request.get('/api/v1/jobs?pageSize=10');
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.meta.counts.clearable).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(Object.keys(item).sort()).toEqual([
        'completedAt',
        'createdAt',
        'key',
        'progress',
        'startedAt',
        'status',
        'type',
      ]);
    }
    expect(JSON.stringify(body.data)).not.toContain('resultJson');
    expect(JSON.stringify(body.data)).not.toContain('errorMessage');
    expect(JSON.stringify(body.data)).not.toContain('progressMessage');
    const serialized = JSON.stringify(body);
    const decodedCursor = Buffer.from(body.meta.nextCursor, 'base64url').toString('utf8');
    expect(Object.keys(JSON.parse(decodedCursor))).toEqual(['key']);
    expect(decodedCursor).not.toContain('history-');
    expect(serialized).not.toContain('history-');
  });
});
