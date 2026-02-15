import { test, expect } from './fixtures/test-app';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveTitle('Settings - Paperless Dedupe');
    await expect(page.locator('main h1')).toHaveText('Settings');
  });

  test('page subtitle renders', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByText('Configure Paperless-NGX connection and deduplication parameters.'),
    ).toBeVisible();
  });

  test('connection form fields render', async ({ page }) => {
    await page.goto('/settings');

    // Connection section
    await expect(page.getByRole('heading', { name: 'Paperless-NGX Connection' })).toBeVisible();

    // URL field
    await expect(page.locator('#paperless-url')).toBeVisible();

    // API Token field
    await expect(page.locator('#api-token')).toBeVisible();

    // Username and password
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('connection action buttons render', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('button', { name: 'Test Connection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('token show/hide toggle works', async ({ page }) => {
    await page.goto('/settings');

    const tokenInput = page.locator('#api-token');
    await expect(tokenInput).toHaveAttribute('type', 'password');

    // Click Show button
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(tokenInput).toHaveAttribute('type', 'text');

    // Click Hide button
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(tokenInput).toHaveAttribute('type', 'password');
  });

  test('dedup parameters section renders', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Deduplication Parameters' })).toBeVisible();

    // Similarity threshold slider
    await expect(page.locator('#threshold')).toBeVisible();

    // Confidence weight labels
    await expect(page.getByText('Confidence Weights')).toBeVisible();
  });

  test('confidence weight sliders render', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('#w-jaccard')).toBeVisible();
    await expect(page.locator('#w-fuzzy')).toBeVisible();
    await expect(page.locator('#w-metadata')).toBeVisible();
    await expect(page.locator('#w-filename')).toBeVisible();
  });

  test('weight sum indicator shows', async ({ page }) => {
    await page.goto('/settings');

    // Should show the sum
    await expect(page.getByText(/Sum: \d+\/100/)).toBeVisible();
  });

  test('save configuration button renders', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('button', { name: 'Save Configuration' })).toBeVisible();
  });

  test('advanced settings toggle works', async ({ page }) => {
    await page.goto('/settings');

    // Advanced settings should be hidden by default
    await expect(page.locator('#num-perms')).not.toBeVisible();

    // Click show advanced
    await page.getByRole('button', { name: 'Show Advanced Settings' }).click();

    // Advanced fields should now be visible
    await expect(page.locator('#num-perms')).toBeVisible();
    await expect(page.locator('#num-bands')).toBeVisible();
    await expect(page.locator('#ngram-size')).toBeVisible();
    await expect(page.locator('#min-words')).toBeVisible();
    await expect(page.locator('#fuzzy-sample')).toBeVisible();
    await expect(page.getByText('Auto-analyze after sync')).toBeVisible();

    // Click hide advanced
    await page.getByRole('button', { name: 'Hide Advanced Settings' }).click();
    await expect(page.locator('#num-perms')).not.toBeVisible();
  });

  test('system information section renders', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByText('System Information')).toBeVisible();
    await expect(page.getByText('Database Path')).toBeVisible();
    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('Pending Groups')).toBeVisible();
  });
});
