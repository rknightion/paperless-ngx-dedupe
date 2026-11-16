import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from './fixtures/test-app';

test.beforeEach(({ seedDB }) => {
  seedDB();
});
test.afterEach(({ clearDB }) => clearDB());

test('remembered decisions load, paginate and remove through the API', async ({
  page,
  request,
}) => {
  const db = new Database(DB_PATH);
  try {
    const insert = db.prepare(
      "INSERT INTO duplicate_pair_decision (id,paperless_id_low,paperless_id_high,decision,source,created_at) VALUES (?,?,?,'not_duplicate','manual','2024-01-01')",
    );
    for (let i = 0; i < 21; i++) insert.run(`decision-${String(i).padStart(2, '0')}`, 1, 999 + i);
  } finally {
    db.close();
  }
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Remembered decisions', exact: true });
  await expect(
    panel.getByRole('heading', { name: 'Remembered decisions (21)', exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /Remove decision/ })).toHaveCount(20);
  await panel.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(panel.getByRole('button', { name: /Remove decision/ })).toHaveCount(21);
  await expect(panel.getByText('Not in local library', { exact: true }).first()).toBeVisible();
  await panel
    .getByRole('button', { name: 'Remove decision between 1 and 999', exact: true })
    .click();
  await expect(
    panel.getByRole('heading', { name: 'Remembered decisions (20)', exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('Decision removed');
  expect(
    (await (await request.get('/api/v1/duplicates/pair-decisions?limit=200')).json()).data.some(
      (item: { id: string }) => item.id === 'decision-00',
    ),
  ).toBe(false);
});

test('analysis results show positive remembered-pair counts only', async ({ page }) => {
  const db = new Database(DB_PATH);
  try {
    db.prepare("UPDATE job SET type='analysis',result_json=? WHERE type='ANALYSIS'").run(
      JSON.stringify({
        totalDocuments: 3,
        documentsAnalyzed: 3,
        documentsSkipped: 0,
        isFullRebuild: true,
        pairsSuppressed: 3,
      }),
    );
    await page.goto('/');
    await expect(
      page.getByText('3 pairs skipped: previously marked not duplicates', { exact: true }),
    ).toBeVisible();
    db.prepare("UPDATE job SET result_json=? WHERE type='analysis'").run(
      JSON.stringify({
        totalDocuments: 3,
        documentsAnalyzed: 3,
        documentsSkipped: 0,
        isFullRebuild: true,
        pairsSuppressed: 0,
      }),
    );
    await page.reload();
    await expect(page.getByText(/pairs skipped: previously marked not duplicates/)).toHaveCount(0);
  } finally {
    db.close();
  }
});

test('failed loads can refresh and a leased removal leaves the decision intact', async ({
  page,
  request,
}) => {
  const {
    data: { id },
  } = await (
    await request.post('/api/v1/duplicates/pair-decisions', { data: { paperlessIds: [1, 999] } })
  ).json();
  await page.route('**/api/v1/duplicates/pair-decisions?*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Remembered decisions', exact: true });
  await expect(panel.getByRole('alert')).toContainText('Could not load');
  await page.unroute('**/api/v1/duplicates/pair-decisions?*');
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(panel.getByRole('heading')).toHaveText('Remembered decisions (1)');
  const db = new Database(DB_PATH);
  try {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO operation_lease (id,operation,owner_id,acquired_at,heartbeat_at,expires_at) VALUES ('blocking-delete','duplicate_delete','blocking-delete',?,?,?)",
    ).run(now, now, new Date(Date.now() + 60000).toISOString());
    await panel
      .getByRole('button', { name: 'Remove decision between 1 and 999', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toContainText('Another duplicate operation');
    await expect(panel.getByRole('status')).toHaveCount(0);
    expect((await (await request.get('/api/v1/duplicates/pair-decisions')).json()).data[0].id).toBe(
      id,
    );
    db.prepare("DELETE FROM operation_lease WHERE id='blocking-delete'").run();
    await panel
      .getByRole('button', { name: 'Remove decision between 1 and 999', exact: true })
      .click();
    await expect(panel.getByRole('status')).toContainText('Decision removed');
    expect((await (await request.get('/api/v1/duplicates/pair-decisions')).json()).data).toEqual(
      [],
    );
  } finally {
    db.close();
  }
});
