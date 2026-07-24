import { readdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { DB_PATH, expect, test } from './fixtures/test-app';

test.describe('database backup', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('downloads an integral SQLite snapshot and leaves no private temporary file', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Database backup' })).toBeVisible();
    await expect(page.getByText('Restore is intentionally an offline operation.')).toBeVisible();
    await expect(
      page.getByText('The backup contains sensitive document metadata and AI review state.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read the offline restore guide' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/rknightion/paperless-ngx-dedupe/blob/main/docs/database-backup-and-restore.md',
    );

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download database backup' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^paperless-ngx-dedupe-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite3$/,
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    const backup = new Database(downloadPath!, { readonly: true, fileMustExist: true });
    try {
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(
        backup
          .prepare(
            `SELECT COUNT(*) AS count
             FROM sqlite_master
             WHERE type = 'table' AND name IN ('document', 'duplicate_group', 'app_config')`,
          )
          .pluck()
          .get(),
      ).toBe(3);
    } finally {
      backup.close();
    }

    await expect
      .poll(async () =>
        (await readdir(dirname(DB_PATH))).filter((name) =>
          name.startsWith('.paperless-ngx-dedupe-backup-'),
        ),
      )
      .toEqual([]);
  });
});
