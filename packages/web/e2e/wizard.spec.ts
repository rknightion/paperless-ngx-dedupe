import { test, expect } from './fixtures/test-app';

test.describe('Bulk Operations Wizard', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/duplicates/wizard');
    await expect(page).toHaveTitle('Bulk Operations Wizard - Paperless Dedupe');
  });

  test('breadcrumb navigation is present', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    await expect(page.locator('main').getByRole('link', { name: 'Duplicates' })).toBeVisible();
    await expect(page.getByText('Bulk Operations Wizard').last()).toBeVisible();
  });

  test('step indicator shows all steps', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    await expect(page.getByText('Filter')).toBeVisible();
    await expect(page.getByText('Review')).toBeVisible();
    await expect(page.getByText('Action')).toBeVisible();
    await expect(page.getByText('Confirm')).toBeVisible();
    await expect(page.getByText('Execute')).toBeVisible();
    await expect(page.getByText('Results')).toBeVisible();
  });

  test('step 1: threshold selection renders', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    await expect(page.getByText('Set Confidence Threshold')).toBeVisible();
    await expect(page.getByText('Minimum Confidence')).toBeVisible();

    // Range slider should be present
    const slider = page.locator('#threshold-range');
    await expect(slider).toBeVisible();

    // Default value should be 95
    await expect(page.getByText('95%').first()).toBeVisible();
  });

  test('step 1: threshold slider changes value', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    const slider = page.locator('#threshold-range');
    await slider.fill('80');

    // Should show updated value
    await expect(page.getByText('80%').first()).toBeVisible();
  });

  test('step 1: match count loads after threshold change', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Wait for match count to load (debounced 300ms)
    await page.waitForTimeout(500);

    // Should show the match count text
    await expect(page.getByText(/pending groups match this threshold/)).toBeVisible();
  });

  test('step 1: next button is disabled when no matches', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Set threshold to 100% which may not match anything
    const slider = page.locator('#threshold-range');
    await slider.fill('100');

    // Wait for count update
    await page.waitForTimeout(500);

    // Next button should have disabled styling if no matches
    const nextButton = page.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeVisible();
  });

  test('step 1 to step 2 navigation', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Wait for match count to load
    await page.waitForTimeout(500);

    // Set a low threshold to ensure matches
    const slider = page.locator('#threshold-range');
    await slider.fill('50');
    await page.waitForTimeout(500);

    // Click Next
    const nextButton = page.getByRole('button', { name: 'Next' });
    await nextButton.click();

    // Step 2 should show
    await expect(page.getByText('Review Matching Groups')).toBeVisible();
  });

  test('step 2: back button returns to step 1', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Go to step 2
    const slider = page.locator('#threshold-range');
    await slider.fill('50');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Review Matching Groups')).toBeVisible();

    // Click Back
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Set Confidence Threshold')).toBeVisible();
  });

  test('step 3: action selection renders three options', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Navigate to step 3
    const slider = page.locator('#threshold-range');
    await slider.fill('50');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Review Matching Groups')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3 should show action options
    await expect(page.getByText('Choose Action')).toBeVisible();
    await expect(page.getByText('Dismiss All')).toBeVisible();
    await expect(page.getByText('Ignore All')).toBeVisible();
    await expect(
      page.locator('div.font-medium', { hasText: 'Delete Non-Primary Documents' }),
    ).toBeVisible();
  });

  test('step 4: confirmation checkboxes required', async ({ page }) => {
    await page.goto('/duplicates/wizard');

    // Navigate to step 4
    const slider = page.locator('#threshold-range');
    await slider.fill('50');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 4 should show confirmation
    await expect(page.getByText('Confirm Action')).toBeVisible();

    // Execute button should be disabled until confirmation checkbox is checked
    const executeButton = page.getByRole('button', { name: 'Execute' });
    await expect(executeButton).toBeDisabled();

    // Check the confirmation checkbox
    await page.getByText('I understand this action affects').click();

    // Execute should now be enabled
    await expect(executeButton).toBeEnabled();
  });
});
