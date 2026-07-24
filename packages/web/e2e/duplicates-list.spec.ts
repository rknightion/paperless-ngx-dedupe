import Database from 'better-sqlite3';

import { test, expect } from './fixtures/test-app';
import { DB_PATH } from './fixtures/test-app';

function seedCursorInbox(): void {
  const db = new Database(DB_PATH);
  const insertDocument = db.prepare(`
    INSERT INTO document (
      id, paperless_id, title, correspondent, processing_status, synced_at
    ) VALUES (?, ?, ?, 'Alice Corp', 'completed', ?)
  `);
  const insertGroup = db.prepare(`
    INSERT INTO duplicate_group (
      id, confidence_score, algorithm_version, status, created_at, updated_at
    ) VALUES (?, ?, 'v1', ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO duplicate_member (id, group_id, document_id, is_primary)
    VALUES (?, ?, ?, 1)
  `);
  const insertAll = db.transaction(() => {
    for (let index = 0; index < 5; index++) {
      const documentId = `cursor-doc-${index}`;
      const groupId = `cursor-group-${index}`;
      const createdAt = `2024-03-${String(10 + index).padStart(2, '0')}T00:00:00Z`;
      insertDocument.run(documentId, 10_000 + index, `Cursor Pending ${index}`, createdAt);
      insertGroup.run(groupId, 0.99 - index / 1_000, 'pending', createdAt, createdAt);
      insertMember.run(`cursor-member-${index}`, groupId, documentId);
    }

    const ignoredAt = '2024-04-01T00:00:00Z';
    insertDocument.run('cursor-doc-ignored', 10_100, 'Cursor Ignored', ignoredAt);
    insertGroup.run('cursor-group-ignored', 1, 'ignored', ignoredAt, ignoredAt);
    insertMember.run('cursor-member-ignored', 'cursor-group-ignored', 'cursor-doc-ignored');
  });

  insertAll();
  db.close();
}

test.describe('Duplicates List Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/duplicates');
    await expect(page).toHaveTitle('Duplicates - Paperless NGX Dedupe');
    await expect(page.locator('main h1')).toHaveText('Duplicate Groups');
  });

  test('table renders with seeded duplicate groups', async ({ page }) => {
    await page.goto('/duplicates');

    // Table should be present
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Should have table headers
    await expect(page.getByRole('columnheader', { name: 'Primary Doc Title' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Members' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Confidence' })).toBeVisible();

    // Should have rows for seeded groups
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('total count badge displays', async ({ page }) => {
    await page.goto('/duplicates');

    // The total count badge is next to the heading
    const badge = page.locator('h1 + span');
    await expect(badge).toBeVisible();
  });

  test('bulk operations wizard link is present', async ({ page }) => {
    await page.goto('/duplicates');

    const wizardLink = page.getByRole('link', { name: 'Bulk Operations Wizard' });
    await expect(wizardLink).toBeVisible();
    await expect(wizardLink).toHaveAttribute('href', '/duplicates/wizard');
  });

  test('status filter dropdown exists', async ({ page }) => {
    await page.goto('/duplicates');

    const statusFilter = page.locator('#status-filter');
    await expect(statusFilter).toBeVisible();

    // Check filter options exist
    await expect(statusFilter.locator('option[value="all"]')).toHaveText('All');
    await expect(statusFilter.locator('option[value="pending"]')).toHaveText('Pending');
    await expect(statusFilter.locator('option[value="false_positive"]')).toHaveText(
      'False Positive',
    );
    await expect(statusFilter.locator('option[value="ignored"]')).toHaveText('Ignored');
    // "Deleted" is no longer in the dropdown — controlled by "Show deleted" toggle instead
    await expect(statusFilter.locator('option[value="deleted"]')).toHaveCount(0);
  });

  test('sort controls exist', async ({ page }) => {
    await page.goto('/duplicates');

    const sortSelect = page.locator('#sort-by');
    await expect(sortSelect).toBeVisible();
    await expect(sortSelect.locator('option[value="confidence"]')).toHaveText('Confidence');
    await expect(sortSelect.locator('option[value="created_at"]')).toHaveText('Created');
    await expect(sortSelect.locator('option[value="member_count"]')).toHaveText('Members');
  });

  test('confidence filter inputs exist', async ({ page }) => {
    await page.goto('/duplicates');

    await expect(page.locator('#min-confidence')).toBeVisible();
    await expect(page.locator('#max-confidence')).toBeVisible();
  });

  test('checkbox selection works', async ({ page }) => {
    await page.goto('/duplicates');

    // Click first row checkbox
    const firstCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]');
    await firstCheckbox.check();

    // Bulk action bar should appear
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not Duplicates' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep All' })).toBeVisible();

    // Uncheck
    await firstCheckbox.uncheck();
    await expect(page.getByText('1 selected')).not.toBeVisible();
  });

  test('select all checkbox works', async ({ page }) => {
    await page.goto('/duplicates');

    // Click select all checkbox in header
    const selectAllCheckbox = page.locator('thead input[type="checkbox"]');
    await selectAllCheckbox.check();

    // Bulk action bar should show correct count
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
  });

  test('row click navigates to detail page', async ({ page }) => {
    await page.goto('/duplicates');

    // Click on the first row (not the checkbox)
    const firstRow = page.locator('tbody tr').first();
    const titleCell = firstRow.locator('td').nth(1);
    await titleCell.click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/duplicates\/[a-zA-Z0-9_-]+$/);
  });

  test('empty state when no duplicates', async ({ page, clearDB }) => {
    clearDB();
    await page.goto('/duplicates');

    await expect(page.getByText('No duplicates found yet')).toBeVisible();
  });

  test('pagination controls render when data exists', async ({ page }) => {
    await page.goto('/duplicates');

    // Should show pagination info
    await expect(page.getByText(/Showing \d+-\d+ of \d+/)).toBeVisible();
  });

  test('next page preserves the cursor inbox queue and correspondent filter', async ({ page }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=2');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Cursor Ignored')).toHaveCount(0);
    const firstPageTitles = await rows.locator('td:nth-child(2)').allTextContents();

    await page.getByRole('link', { name: 'Next' }).click();

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('queue')).toBe('high-confidence');
      expect(url.searchParams.get('correspondent')).toBe('Alice Corp');
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.get('cursor')).toBeTruthy();
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Cursor Ignored')).toHaveCount(0);
    const secondPageTitles = await rows.locator('td:nth-child(2)').allTextContents();
    expect(secondPageTitles).not.toEqual(firstPageTitles);
    await expect(rows.locator('td:nth-child(5)')).toHaveText(['pending', 'pending']);
  });

  test('inbox confidence change from page two restarts the same inbox at page one', async ({
    page,
  }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=2');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    const firstPageTitles = await rows.locator('td:nth-child(2)').allTextContents();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL((url) => Boolean(url.searchParams.get('cursor')));
    const secondPageTitles = await rows.locator('td:nth-child(2)').allTextContents();
    expect(secondPageTitles).not.toEqual(firstPageTitles);

    const firstCheckbox = rows.first().locator('input[type="checkbox"]');
    await firstCheckbox.check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await firstCheckbox.uncheck();

    const confidenceNavigation = page.waitForURL(
      (url) =>
        url.searchParams.get('queue') === 'high-confidence' &&
        url.searchParams.get('correspondent') === 'Alice Corp' &&
        url.searchParams.get('minConfidence') === '0.98' &&
        !url.searchParams.has('cursor') &&
        !url.searchParams.has('offset'),
    );
    await page.locator('#min-confidence').fill('98');
    await page.locator('#min-confidence').blur();
    await confidenceNavigation;

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('queue')).toBe('high-confidence');
      expect(url.searchParams.get('correspondent')).toBe('Alice Corp');
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.get('minConfidence')).toBe('0.98');
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
    await expect(rows).toHaveCount(2);
    expect(await rows.locator('td:nth-child(2)').allTextContents()).toEqual(firstPageTitles);
    await expect(rows.locator('td:nth-child(5)')).toHaveText(['pending', 'pending']);
  });

  test('legacy status and sort changes from inbox page two restart in legacy mode', async ({
    page,
  }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=2');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    const firstPageTitles = await rows.locator('td:nth-child(2)').allTextContents();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL((url) => Boolean(url.searchParams.get('cursor')));

    const firstCheckbox = rows.first().locator('input[type="checkbox"]');
    await firstCheckbox.check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await firstCheckbox.uncheck();

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('status') === 'pending' &&
          !url.searchParams.has('queue') &&
          !url.searchParams.has('correspondent') &&
          !url.searchParams.has('cursor') &&
          !url.searchParams.has('offset'),
      ),
      page.locator('#status-filter').selectOption('pending'),
    ]);

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('status')).toBe('pending');
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.has('queue')).toBe(false);
      expect(url.searchParams.has('correspondent')).toBe(false);
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
    await expect(rows).toHaveCount(2);
    expect(await rows.locator('td:nth-child(2)').allTextContents()).toEqual(firstPageTitles);
    await expect(rows.locator('td:nth-child(5)')).toHaveText(['pending', 'pending']);

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('status') === 'pending' &&
          url.searchParams.get('sortBy') === 'created_at' &&
          !url.searchParams.has('queue') &&
          !url.searchParams.has('correspondent') &&
          !url.searchParams.has('cursor') &&
          !url.searchParams.has('offset'),
      ),
      page.locator('#sort-by').selectOption('created_at'),
    ]);

    await expect(rows).toHaveCount(2);
    await expect(rows.locator('td:nth-child(5)')).toHaveText(['pending', 'pending']);
    await expect(page.getByText('Showing 1-2 of 6')).toBeVisible();
  });

  test('legacy next page preserves confidence, status, and sort filters', async ({ page }) => {
    seedCursorInbox();
    await page.goto(
      '/duplicates?minConfidence=0.97&status=pending&sortBy=confidence&sortOrder=desc&limit=2&offset=0',
    );

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    const firstPageTitles = await rows.locator('td:nth-child(2)').allTextContents();

    await page.getByRole('link', { name: 'Next' }).click();

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('minConfidence')).toBe('0.97');
      expect(url.searchParams.get('status')).toBe('pending');
      expect(url.searchParams.get('sortBy')).toBe('confidence');
      expect(url.searchParams.get('sortOrder')).toBe('desc');
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.get('offset')).toBe('2');
      expect(url.searchParams.has('cursor')).toBe(false);
      return true;
    });
    await expect(rows).toHaveCount(2);
    const secondPageTitles = await rows.locator('td:nth-child(2)').allTextContents();
    expect(secondPageTitles).not.toEqual(firstPageTitles);
    await expect(rows.locator('td:nth-child(5)')).toHaveText(['pending', 'pending']);
  });

  test('default inbox page size change stays in the pending inbox', async ({ page }) => {
    seedCursorInbox();
    await page.goto('/duplicates');

    const rows = page.locator('tbody tr');
    await expect(rows).not.toHaveCount(0);
    await expect(page.getByText('Cursor Ignored')).toHaveCount(0);
    const firstCheckbox = rows.first().locator('input[type="checkbox"]');
    await firstCheckbox.check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await firstCheckbox.uncheck();

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('queue') === 'pending' && url.searchParams.get('limit') === '10',
      ),
      page.locator('select').last().selectOption('10'),
    ]);

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('queue')).toBe('pending');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
    await expect(rows).not.toHaveCount(0);
    await expect(page.getByText('Cursor Ignored')).toHaveCount(0);
    const statuses = await rows.locator('td:nth-child(5)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 'pending')).toBe(true);
  });

  test('legacy page size change stays legacy and preserves its filters', async ({ page }) => {
    seedCursorInbox();
    await page.goto(
      '/duplicates?minConfidence=0.97&status=pending&sortBy=confidence&sortOrder=desc&limit=2&offset=2',
    );
    const firstCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]');
    await firstCheckbox.check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await firstCheckbox.uncheck();

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('minConfidence') === '0.97' &&
          url.searchParams.get('status') === 'pending' &&
          url.searchParams.get('limit') === '25',
      ),
      page.locator('select').last().selectOption('25'),
    ]);

    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('minConfidence')).toBe('0.97');
      expect(url.searchParams.get('status')).toBe('pending');
      expect(url.searchParams.get('sortBy')).toBe('confidence');
      expect(url.searchParams.get('sortOrder')).toBe('desc');
      expect(url.searchParams.get('limit')).toBe('25');
      expect(url.searchParams.has('queue')).toBe(false);
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
    const statuses = await page.locator('tbody tr td:nth-child(5)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 'pending')).toBe(true);
  });
});
