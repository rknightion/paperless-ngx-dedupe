import { expect, test } from './fixtures/test-app';

test.afterEach(async ({ clearDB }) => clearDB());

test('notification preferences recover from loading failure', async ({ page }) => {
  let loads = 0;
  await page.route('**/api/v1/notifications', async (route) => {
    loads++;
    if (loads === 1) await route.fulfill({ status: 503, json: { error: {} } });
    else await route.continue();
  });
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Automation' }).click();
  const card = page.getByRole('region', { name: 'Notifications', exact: true });
  await expect(card.getByRole('alert')).toContainText('Unable to load');
  await card.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(card.getByLabel('Minimum new groups')).toHaveValue('1');
});

test('notification preferences retain edits after saving failure', async ({ page }) => {
  await page.route('**/api/v1/config', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({ status: 503, json: { error: {} } });
    else await route.continue();
  });
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Automation' }).click();
  const card = page.getByRole('region', { name: 'Notifications', exact: true });
  await card.getByLabel('Minimum new groups').fill('9');
  const save = card.getByRole('button', { name: 'Save notification preferences' });
  await save.click();
  await expect(card.getByRole('alert')).toContainText('Unable to save');
  await expect(save).toBeEnabled();
  await expect(card.getByLabel('Minimum new groups')).toHaveValue('9');
  await page.unroute('**/api/v1/config');
  await save.click();
  await expect(card.getByRole('status')).toContainText('Preferences saved');
});

test('send test reports delivery failure and can retry successfully', async ({ page }) => {
  await page.route('**/api/v1/notifications', async (route) =>
    route.fulfill({
      json: {
        data: {
          configured: true,
          format: 'ntfy',
          events: {
            onNewDuplicates: true,
            minNewGroups: 1,
            onJobFailure: true,
            scheduledRunsOnly: true,
          },
        },
      },
    }),
  );
  const requests: unknown[] = [];
  await page.route('**/api/v1/notifications/test', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toBe('application/json');
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        data:
          requests.length === 1
            ? { delivered: false, status: 503 }
            : { delivered: true, status: 204 },
      },
    });
  });
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Automation' }).click();
  const card = page.getByRole('region', { name: 'Notifications', exact: true });
  await card.getByRole('button', { name: 'Send test', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('not delivered');
  await expect(card.getByRole('alert')).toContainText('503');
  await card.getByRole('button', { name: 'Send test', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('Test notification delivered');
  expect(requests).toEqual([{}, {}]);
});

test('notification preferences persist without an outbound destination', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Automation' }).click();
  const card = page.getByRole('region', { name: 'Notifications', exact: true });
  await expect(card.getByLabel('Notify when new duplicates are found')).toBeChecked();
  await expect(card.getByLabel('Minimum new groups')).toHaveValue('1');
  await expect(card.getByLabel('Notify when a job fails')).toBeChecked();
  await expect(card.getByLabel('Scheduled runs only')).toBeChecked();
  await expect(card.getByRole('button', { name: 'Send test', exact: true })).toBeDisabled();

  await card.getByLabel('Notify when new duplicates are found').uncheck();
  await card.getByLabel('Minimum new groups').fill('7');
  await card.getByLabel('Notify when a job fails').uncheck();
  await card.getByLabel('Scheduled runs only').uncheck();
  await card.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(card.getByRole('status')).toContainText('Preferences saved');
  expect((await (await request.get('/api/v1/notifications')).json()).data).toEqual({
    configured: false,
    format: 'json',
    events: {
      onNewDuplicates: false,
      minNewGroups: 7,
      onJobFailure: false,
      scheduledRunsOnly: false,
    },
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Automation' }).click();
  await expect(card.getByLabel('Minimum new groups')).toHaveValue('7');
  await expect(card.getByLabel('Scheduled runs only')).not.toBeChecked();
});
