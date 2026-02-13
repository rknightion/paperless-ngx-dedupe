import { test, expect } from './fixtures/test-app';

test.describe('Duplicates List Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/duplicates');
    await expect(page).toHaveTitle('Duplicates - Paperless Dedupe');
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
    await expect(statusFilter.locator('option[value="unreviewed"]')).toHaveText('Unreviewed');
    await expect(statusFilter.locator('option[value="reviewed"]')).toHaveText('Reviewed');
    await expect(statusFilter.locator('option[value="resolved"]')).toHaveText('Resolved');
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
    await expect(page.getByRole('button', { name: 'Mark Reviewed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve Selected' })).toBeVisible();

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
    await expect(page).toHaveURL(/\/duplicates\//);
    await expect(page.url()).toMatch(/\/duplicates\/[a-zA-Z0-9_-]+$/);
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
});
