import { test, expect } from './fixtures/test-app';

test('webhook preferences save, survive reload and report rejected saves', async ({
  page,
  request,
  seedDB,
  clearDB,
}) => {
  seedDB();
  try {
    await page.goto('/settings#automation');
    await page.getByRole('tab', { name: 'Automation', exact: true }).click();
    const card = page.getByRole('region', { name: 'Webhook sync', exact: true });
    await expect(card).toBeVisible();
    const enabled = card.getByLabel('Sync when Paperless sends a webhook');
    const quiet = card.getByLabel('Quiet period (seconds)');
    await expect(enabled).not.toBeChecked();
    await expect(quiet).toHaveValue('60');
    await enabled.check();
    await quiet.fill('45');
    await card.getByRole('button', { name: 'Save webhook preferences' }).click();
    await expect(card.getByRole('status')).toHaveText('Webhook preferences saved');
    expect((await (await request.get('/api/v1/config')).json()).data).toMatchObject({
      'automation.webhookSyncEnabled': 'true',
      'automation.webhookQuietSeconds': '45',
    });
    await page.reload();
    await page.getByRole('tab', { name: 'Automation', exact: true }).click();
    await expect(enabled).toBeChecked();
    await expect(quiet).toHaveValue('45');
    await quiet.fill('9');
    await card.getByRole('button', { name: 'Save webhook preferences' }).click();
    expect(await quiet.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(
      true,
    );
    expect(
      (await (await request.get('/api/v1/config')).json()).data['automation.webhookQuietSeconds'],
    ).toBe('45');
    await quiet.fill('120');
    await page.route('**/api/v1/config', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }),
      }),
    );
    await card.getByRole('button', { name: 'Save webhook preferences' }).click();
    await expect(card.getByRole('alert')).toHaveText(
      'Unable to save webhook preferences. Try again.',
    );
    expect(
      (await (await request.get('/api/v1/config')).json()).data['automation.webhookQuietSeconds'],
    ).toBe('45');
  } finally {
    clearDB();
  }
});
