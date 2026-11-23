import { expect, test } from './fixtures/test-app';

test.afterEach(({ clearDB }) => clearDB());

test('narrow navigation returns focus and blocks duplicate shortcuts', async ({ page, seedDB }) => {
  const seed = seedDB();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/duplicates/${seed.groupIds[0]}`);
  await expect(page.locator('#app-sidebar')).toHaveAttribute('inert', '');

  const open = page.getByRole('button', { name: 'Open navigation' });
  const close = page.getByRole('button', { name: 'Close navigation' });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(close).toBeFocused();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })).toBeHidden();
  await expect(close).toBeFocused();
});
