import Database from 'better-sqlite3';
import type { Route } from '@playwright/test';

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
    await page.getByRole('link', { name: 'Use legacy list' }).click();

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
    await page.getByRole('link', { name: 'Use legacy list' }).click();

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

    const firstRow = page.locator('tbody tr').first();
    await firstRow.getByRole('link').click();

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

    await expect(page.getByText(/\d+ on this page · \d+ in this queue/)).toBeVisible();
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

    await page.getByRole('link', { name: 'Use legacy list' }).click();

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

  test('inbox filters persist canonically in the URL and clear stale pagination', async ({
    page,
  }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=2');

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('queue') === 'ambiguous' &&
          url.searchParams.get('correspondent') === 'Alice Corp' &&
          !url.searchParams.has('cursor') &&
          !url.searchParams.has('offset'),
      ),
      page.getByLabel('Review queue').selectOption('ambiguous'),
    ]);
    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('queue')).toBe('ambiguous');
      expect(url.searchParams.get('correspondent')).toBe('Alice Corp');
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });

    await page.getByLabel('Correspondent').fill('Bob Industries');
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('queue') === 'ambiguous' &&
          url.searchParams.get('correspondent') === 'Bob Industries' &&
          !url.searchParams.has('cursor') &&
          !url.searchParams.has('offset'),
      ),
      page.getByLabel('Correspondent').press('Enter'),
    ]);
    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('queue')).toBe('ambiguous');
      expect(url.searchParams.get('correspondent')).toBe('Bob Industries');
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.has('offset')).toBe(false);
      return true;
    });
  });

  test('visible keyboard shortcuts navigate to the next page and back', async ({ page }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=2');

    await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toContainText(
      'Next page',
    );
    const firstPageTitles = await page.locator('tbody tr td:nth-child(2)').allTextContents();

    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL((url) => Boolean(url.searchParams.get('cursor')));
    expect(await page.locator('tbody tr td:nth-child(2)').allTextContents()).not.toEqual(
      firstPageTitles,
    );

    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL((url) => !url.searchParams.has('cursor'));
    await expect(page.locator('tbody tr td:nth-child(2)')).toHaveText(firstPageTitles);
  });

  test('bulk delete shows the authoritative exact preview before explicit confirmation', async ({
    page,
  }) => {
    let executeRequests = 0;
    await page.route('**/api/v1/batch/delete-non-primary/preview', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ groupIds: [expect.any(String)] });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            planToken: 'opaque-reviewed-plan-token-00000000000001',
            expiresAt: '2099-07-24T12:15:00.000Z',
            groupCount: 1,
            documentCount: 1,
            groups: [
              {
                groupId: 'reviewed-group',
                updatedAt: '2026-07-24T11:00:00.000Z',
                primaryDocumentId: 'document-primary',
                primaryPaperlessId: 101,
                nonPrimaryDocuments: [{ documentId: 'document-duplicate', paperlessId: 202 }],
              },
            ],
          },
        }),
      });
    });
    await page.route('**/api/v1/batch/delete-non-primary', async (route) => {
      executeRequests++;
      expect(route.request().postDataJSON()).toEqual({
        planToken: 'opaque-reviewed-plan-token-00000000000001',
        confirm: true,
      });
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });

    await page.goto('/duplicates');
    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Delete Non-Primary' }).click();

    const preview = page.getByRole('dialog', { name: 'Review documents to delete' });
    await expect(preview).toContainText('Paperless document #202');
    await expect(preview).toContainText('Primary kept: Paperless document #101');
    await expect(preview).toContainText('recycle bin');
    expect(executeRequests).toBe(0);

    const deleteButton = preview.getByRole('button', { name: 'Delete 1 document' });
    await expect(deleteButton).toBeDisabled();
    await preview.getByLabel('I reviewed this exact deletion list').check();
    await deleteButton.click();

    await expect(
      page.getByRole('dialog', { name: 'Confirm deletion of reviewed documents' }),
    ).toBeVisible();
    expect(executeRequests).toBe(0);
    await page.getByRole('button', { name: 'Move documents to recycle bin' }).click();
    await expect.poll(() => executeRequests).toBe(1);
  });

  test('bulk preview reports an expired or conflicted review without mutating', async ({
    page,
  }) => {
    let executeRequests = 0;
    await page.route('**/api/v1/batch/delete-non-primary/preview', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'CONFLICT', message: 'The reviewed selection changed or expired' },
        }),
      });
    });
    await page.route('**/api/v1/batch/delete-non-primary', async (route) => {
      executeRequests++;
      await route.abort();
    });

    await page.goto('/duplicates');
    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Delete Non-Primary' }).click();

    await expect(page.getByRole('alert')).toContainText('changed or expired');
    expect(executeRequests).toBe(0);
  });

  test('inbox controls and reviewed deletion action remain usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/duplicates');

    await expect(page.getByLabel('Review queue')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
    await expect(page.getByRole('button', { name: 'Delete Non-Primary' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('cursor pages use explicit predecessor URLs and truthful page counts', async ({ page }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=1');

    await expect(page.getByText('1 on this page · 6 in this queue')).toBeVisible();
    const firstUrl = page.url();
    await page.getByRole('link', { name: 'Next' }).click();
    const secondUrl = page.url();
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText('1 on this page · 6 in this queue')).toBeVisible();

    const previous = page.getByRole('link', { name: 'Previous' });
    await expect(previous).toHaveAttribute('href', secondUrl.replace('http://localhost:4173', ''));
    await previous.click();
    await expect(page).toHaveURL(secondUrl);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      firstUrl.replace('http://localhost:4173', ''),
    );
  });

  test('a directly opened cursor does not invent a previous page', async ({ page }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=1');
    await page.getByRole('link', { name: 'Next' }).click();
    const cursorUrl = page.url();

    await page.evaluate(() => sessionStorage.clear());
    await page.goto(cursorUrl);

    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(
      page.getByText('Previous page is unavailable for this direct link.'),
    ).toBeVisible();
  });

  test('a stale slower preview response cannot replace a newer selection', async ({ page }) => {
    seedCursorInbox();
    const pending = new Map<string, Route>();
    await page.route('**/api/v1/batch/delete-non-primary/preview', async (route) => {
      const ids = (route.request().postDataJSON() as { groupIds: string[] }).groupIds;
      pending.set(String(ids.length), route);
    });

    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp');
    const checkboxes = page.locator('tbody tr input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.getByRole('button', { name: 'Delete Non-Primary' }).click();
    await expect.poll(() => pending.has('2')).toBe(true);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await checkboxes.nth(1).uncheck();
    await page.getByRole('button', { name: 'Delete Non-Primary' }).click();
    await expect.poll(() => pending.has('1')).toBe(true);

    await pending.get('1')!.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          planToken: 'newer-selection-plan-token-000000000001',
          expiresAt: '2099-07-24T12:15:00.000Z',
          groupCount: 1,
          documentCount: 1,
          groups: [
            {
              groupId: 'newer-group',
              primaryPaperlessId: 101,
              nonPrimaryDocuments: [{ documentId: 'newer-document', paperlessId: 202 }],
            },
          ],
        },
      }),
    });
    await expect(page.getByText('Paperless document #202')).toBeVisible();

    await pending
      .get('2')!
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            planToken: 'stale-selection-plan-token-000000000001',
            expiresAt: '2099-07-24T12:15:00.000Z',
            groupCount: 2,
            documentCount: 2,
            groups: [
              {
                groupId: 'stale-group-a',
                primaryPaperlessId: 301,
                nonPrimaryDocuments: [{ documentId: 'stale-a', paperlessId: 302 }],
              },
              {
                groupId: 'stale-group-b',
                primaryPaperlessId: 401,
                nonPrimaryDocuments: [{ documentId: 'stale-b', paperlessId: 402 }],
              },
            ],
          },
        }),
      })
      .catch(() => undefined);
    await expect(page.getByText('Paperless document #402')).toHaveCount(0);
    await expect(page.getByText('Paperless document #202')).toBeVisible();
  });

  test('execute conflict discards the plan and double confirmation submits once', async ({
    page,
  }) => {
    let previewRequests = 0;
    let executeRequests = 0;
    await page.route('**/api/v1/batch/delete-non-primary/preview', async (route) => {
      previewRequests++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            planToken: `reviewed-plan-token-${previewRequests}`.padEnd(40, '0'),
            expiresAt: '2099-07-24T12:15:00.000Z',
            groupCount: 1,
            documentCount: 1,
            groups: [
              {
                groupId: 'reviewed-group',
                primaryPaperlessId: 101,
                nonPrimaryDocuments: [{ documentId: 'duplicate', paperlessId: 202 }],
              },
            ],
          },
        }),
      });
    });
    await page.route('**/api/v1/batch/delete-non-primary', async (route) => {
      executeRequests++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Reviewed plan expired' } }),
      });
    });

    await page.goto('/duplicates');
    await page.locator('tbody tr input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Delete Non-Primary' }).click();
    await page.getByLabel('I reviewed this exact deletion list').check();
    await page.getByRole('button', { name: 'Delete 1 document' }).click();
    await page.getByRole('button', { name: 'Move documents to recycle bin' }).dblclick();

    await expect(page.getByRole('alert')).toContainText('Reviewed plan expired');
    expect(executeRequests).toBe(1);
    await expect(page.getByLabel('I reviewed this exact deletion list')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review selection again' })).toBeVisible();
    await page.getByRole('button', { name: 'Review selection again' }).click();
    await expect.poll(() => previewRequests).toBe(2);
  });

  test('review modal is truly modal, traps focus, restores focus, and blocks shortcuts', async ({
    page,
  }) => {
    seedCursorInbox();
    await page.goto('/duplicates?queue=high-confidence&correspondent=Alice%20Corp&limit=1');
    const checkbox = page.locator('tbody tr input[type="checkbox"]').first();
    await checkbox.check();
    const openButton = page.getByRole('button', { name: 'Delete Non-Primary' });
    await openButton.focus();
    const originalUrl = page.url();
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: 'Review documents to delete' });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => (element as HTMLDialogElement).matches(':modal')),
    ).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(originalUrl);
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.querySelector('dialog[open]')?.contains(document.activeElement),
      ),
    ).toBe(true);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(openButton).toBeFocused();
  });

  test('duplicate titles are real keyboard-operable detail links', async ({ page }) => {
    await page.goto('/duplicates?queue=pending&limit=10');
    const titleLink = page.locator('tbody tr').first().getByRole('link');
    const href = await titleLink.getAttribute('href');
    expect(href).toContain('returnParams=');

    await titleLink.focus();
    await expect(titleLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/duplicates\/[a-zA-Z0-9_-]+\?returnParams=/);
  });

  test('filter controls describe only the active dataset mode', async ({ page }) => {
    await page.goto('/duplicates');
    await expect(page.getByLabel('Review queue')).toHaveValue('pending');
    await expect(page.locator('#status-filter')).toHaveCount(0);

    await page.getByRole('link', { name: 'Use legacy list' }).click();
    await expect(page).toHaveURL((url) => {
      expect(url.searchParams.get('status')).toBe('pending');
      expect(url.searchParams.has('queue')).toBe(false);
      return true;
    });
    await expect(page.locator('#status-filter')).toHaveValue('pending');
    await expect(page.getByLabel('Review queue')).toHaveCount(0);
  });
});
