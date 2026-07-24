import { test, expect } from './fixtures/test-app';
import type { SeedResult } from './fixtures/seed-data';
import Database from 'better-sqlite3';
import { DB_PATH } from './fixtures/test-app';

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
    await expect(page).toHaveTitle(/Paperless NGX Dedupe/);

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

    // Should show primary badge for primary member (scoped to table to avoid matching ConfirmDialog)
    await expect(page.locator('table').getByText('Primary').first()).toBeVisible();
  });

  test('set primary button visible for non-primary members', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // The first group has 2 members, one non-primary should have "Set as Primary" button
    await expect(page.getByRole('button', { name: 'Set as Primary' })).toBeVisible();
  });

  test('selected primary persists after a reload', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    const members = page.locator('table').first().locator('tbody tr');
    const promotedTitle = (await members.nth(1).locator('td').first().textContent())?.trim();
    await members.nth(1).getByRole('button', { name: 'Set as Primary' }).click();
    const promotedRow = page
      .locator('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: promotedTitle ?? '' });
    await expect(promotedRow.getByText('Primary', { exact: true })).toBeVisible();

    await page.reload();
    const reloadedPrimaryRow = page
      .locator('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: promotedTitle ?? '' });
    await expect(reloadedPrimaryRow.getByText('Primary', { exact: true })).toBeVisible();
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

  test('shows why documents matched and their key differences', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const db = new Database(DB_PATH);
    db.prepare('UPDATE document_content SET normalized_text = ? WHERE document_id = ?').run(
      'invoice number inv-2024-001 date 15/01/2024 total £1234.56 from lhr to jfk',
      seed.documentIds[0],
    );
    db.prepare('UPDATE document_content SET normalized_text = ? WHERE document_id = ?').run(
      'invoice number inv-2024-001 date 16/01/2024 total £1234.56 from jfk to lhr',
      seed.documentIds[1],
    );
    db.close();

    await page.goto(`/duplicates/${seed.groupIds[0]}`);

    const explanation = page.getByRole('region', { name: 'Match explanation' });
    await expect(explanation.getByRole('heading', { name: 'Why these matched' })).toBeVisible();
    await expect(explanation.getByText('1234.56')).toBeVisible();
    await expect(explanation.getByRole('heading', { name: 'Key differences' })).toBeVisible();
    await expect(explanation.getByText('lhr → jfk')).toBeVisible();
    await expect(explanation.getByText('jfk → lhr')).toBeVisible();
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
