import { test, expect } from './fixtures/test-app';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Dashboard - Paperless NGX Dedupe');
    await expect(page.locator('main h1')).toHaveText('Dashboard');
  });

  test('stat cards render with data', async ({ page }) => {
    await page.goto('/');

    // Stat cards should display
    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('Pending Groups')).toBeVisible();
    await expect(page.getByText('Storage Savings')).toBeVisible();
    await expect(page.getByText('Pending Analysis')).toBeVisible();
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Paperless NGX Dedupe')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Documents' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Duplicates' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('sidebar navigation links work', async ({ page }) => {
    await page.goto('/');

    // Navigate to Documents
    await page.locator('aside').getByRole('link', { name: 'Documents' }).click();
    await expect(page).toHaveURL(/\/documents/);

    // Navigate to Duplicates
    await page.locator('aside').getByRole('link', { name: 'Duplicates' }).click();
    await expect(page).toHaveURL(/\/duplicates/);

    // Navigate to Settings
    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);

    // Navigate back to Dashboard
    await page.locator('aside').getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
  });

  test('sync and analysis action buttons are visible', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeVisible();
  });

  test('sync controls section renders', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Sync Documents')).toBeVisible();
    await expect(page.getByText('Pull latest documents from Paperless-NGX.')).toBeVisible();
    await expect(page.getByText('Force Full Sync')).toBeVisible();
  });

  test('analysis controls section renders', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Duplicate Analysis')).toBeVisible();
    await expect(page.getByText('Run deduplication analysis on synced documents.')).toBeVisible();
    await expect(page.getByText('Force Rebuild')).toBeVisible();
  });

  test('recent jobs section renders when jobs exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Recent Jobs')).toBeVisible();
  });
});
