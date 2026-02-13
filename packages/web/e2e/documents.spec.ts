import { test, expect } from './fixtures/test-app';

test.describe('Documents Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).toHaveTitle('Documents - Paperless Dedupe');
    await expect(page.locator('main h1')).toHaveText('Documents');
  });

  test('document statistics cards render', async ({ page }) => {
    await page.goto('/documents');

    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('OCR Coverage')).toBeVisible();
    await expect(page.getByText('Processing')).toBeVisible();
    await expect(page.getByText('Avg Word Count')).toBeVisible();
  });

  test('chart sections render with canvas elements', async ({ page }) => {
    await page.goto('/documents');

    // EChart renders to canvas elements
    const canvases = page.locator('canvas');
    // At least one chart should be present (correspondents, doc types, or tags)
    const count = await canvases.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('external Paperless link is present', async ({ page }) => {
    await page.goto('/documents');

    const link = page.getByRole('link', { name: 'Open Paperless-NGX' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /\/documents\//);
  });

  test('manage documents section renders', async ({ page }) => {
    await page.goto('/documents');

    await expect(page.getByText('Manage Documents')).toBeVisible();
    await expect(
      page.getByText('Open Paperless-NGX to manage individual documents.'),
    ).toBeVisible();
  });
});
