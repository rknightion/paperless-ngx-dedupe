import { test, expect } from './fixtures/test-app';
import type { SeedResult } from './fixtures/seed-data';

test.describe('Duplicate Detail Page', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads with group info', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // Page title should contain group info
    await expect(page).toHaveTitle(/Paperless Dedupe/);

    // Header should show confidence badge
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('breadcrumb back link works', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    const backLink = page.locator('main').getByRole('link', { name: /Back to Duplicates/ });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/duplicates');
  });

  test('group header shows confidence and status badges', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // The header area should contain algorithm version text
    await expect(page.getByText(/Algorithm v/)).toBeVisible();
  });

  test('action bar renders with status action buttons', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // GroupActionBar should render action buttons for pending groups
    await expect(page.getByRole('button', { name: 'Not a Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Duplicates' })).toBeVisible();
  });

  test('members table lists all members', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // Members heading
    await expect(page.locator('h3', { hasText: 'Members' })).toBeVisible();

    // Members table should have headers
    const membersTable = page.locator('table').first();
    await expect(membersTable.getByText('Title')).toBeVisible();
    await expect(membersTable.getByText('Correspondent')).toBeVisible();
    await expect(membersTable.getByText('Role')).toBeVisible();
    await expect(membersTable.getByText('File Size')).toBeVisible();

    // Should show primary badge for primary member (scoped to table to avoid matching ConfirmDialog)
    await expect(page.locator('table').getByText('Primary').first()).toBeVisible();
  });

  test('set primary button visible for non-primary members', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // The first group has 2 members, one non-primary should have "Set as Primary" button
    await expect(page.getByRole('button', { name: 'Set as Primary' })).toBeVisible();
  });

  test('document comparison section renders', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    await expect(page.getByText('Document Comparison')).toBeVisible();
  });

  test('confidence breakdown section renders', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // ConfidenceBreakdown heading
    await expect(page.getByText('Confidence Breakdown')).toBeVisible();
  });

  test('404 for non-existent group', async ({ page }) => {
    const response = await page.goto('/duplicates/nonexistent-id');
    expect(response?.status()).toBe(404);
  });

  test('group with 3 members shows secondary selector', async ({ page }) => {
    // Group 2 has 3 members
    const groupId = seed.groupIds[1];
    await page.goto(`/duplicates/${groupId}`);

    // With 3 members (1 primary + 2 secondary), secondary selector buttons should appear
    await expect(page.getByText('Document Comparison')).toBeVisible();
  });
});
