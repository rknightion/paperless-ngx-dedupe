import { test, expect } from './fixtures/test-app';
import { readFile } from 'node:fs/promises';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveTitle('Settings - Paperless NGX Dedupe');
    await expect(page.locator('main h1')).toHaveText('Settings');
  });

  test('page subtitle renders', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByText('Configure Paperless-NGX connection and deduplication parameters.'),
    ).toBeVisible();
  });

  test('connection settings are environment-owned and never serialize credentials', async ({
    page,
  }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Paperless-NGX Connection' })).toBeVisible();
    await expect(
      page.getByText('Connection settings are managed by environment variables.'),
    ).toBeVisible();
    await expect(page.locator('#paperless-url')).toHaveAttribute('readonly');
    await expect(page.locator('#api-token')).toHaveCount(0);
    await expect(page.locator('#username')).toHaveCount(0);
    await expect(page.locator('#password')).toHaveCount(0);
    expect(await page.content()).not.toContain('test-token-e2e');
    expect(await page.content()).not.toContain('./data/e2e-test.db');
  });

  test('connection action buttons render', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('button', { name: 'Test Connection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  });

  test('connection result is announced through an accessible live region', async ({ page }) => {
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByRole('status')).toContainText('Connected!');
  });

  test('shows read-only maintenance, retention and storage reporting', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'System & backup' }).click();
    const report = page.getByRole('region', { name: 'Maintenance report' });
    await expect(report).toBeVisible();
    await expect(report).toContainText('Active leases');
    await expect(report).toContainText('Terminal jobs');
    await expect(report).toContainText('Allocated database storage');
  });

  test('switches between focused settings sections', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'AI Processing' }).click();
    await expect(page.getByRole('heading', { name: 'AI Processing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paperless-NGX Connection' })).toBeHidden();
    await page.getByRole('tab', { name: 'Connection' }).click();
    await expect(page.getByRole('heading', { name: 'Paperless-NGX Connection' })).toBeVisible();
  });

  test('dedup parameters section renders', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Deduplication' }).click();

    await expect(page.getByRole('heading', { name: 'Deduplication Parameters' })).toBeVisible();

    // Similarity threshold slider
    await expect(page.locator('#threshold')).toBeVisible();

    // Confidence weight labels
    await expect(page.getByText('Confidence Weights')).toBeVisible();
  });

  test('confidence weight sliders render', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Deduplication' }).click();

    await expect(page.locator('#w-jaccard')).toBeVisible();
    await expect(page.locator('#w-fuzzy')).toBeVisible();
  });

  test('weight sum indicator shows', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Deduplication' }).click();

    // Should show the sum
    await expect(page.getByText(/Sum: \d+\/100/)).toBeVisible();
  });

  test('save configuration button renders', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Deduplication' }).click();

    await expect(page.getByRole('button', { name: 'Save Configuration' })).toBeVisible();
  });

  test('advanced settings toggle works', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Deduplication' }).click();

    // Advanced settings should be hidden by default
    await expect(page.locator('#num-perms')).not.toBeVisible();

    // Click show advanced
    await page.locator('#dedup').getByRole('button', { name: 'Show Advanced Settings' }).click();

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
    await page.getByRole('tab', { name: 'System & backup' }).click();

    await expect(page.getByText('System Information')).toBeVisible();
    await expect(page.getByText('Database Path')).toHaveCount(0);
    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('Pending Groups')).toBeVisible();
  });

  test('downloads an accessible redacted diagnostics bundle without environment secrets', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'System & backup' }).click();

    await expect(page.getByRole('heading', { name: 'Support diagnostics' })).toBeVisible();
    await expect(
      page.getByText('Only aggregate operational information is included.'),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download diagnostics bundle' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('paperless-ngx-dedupe-diagnostics.json');
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const body = await readFile(downloadPath!, 'utf8');

    expect(JSON.parse(body)).toMatchObject({
      formatVersion: 1,
      versions: { application: '0.15.0' },
      readiness: { database: 'unknown', paperless: 'configured', ai: 'configured' },
      database: { sqliteUserVersion: 0 },
    });
    expect(JSON.parse(body).database).not.toHaveProperty('schemaVersion');
    expect(body).not.toContain('test-token-e2e');
    expect(body).not.toContain('http://localhost:18923');
    expect(body).not.toContain('./data/e2e-test.db');
  });
});
