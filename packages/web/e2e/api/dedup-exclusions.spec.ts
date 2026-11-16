import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';
import { seedDatabase } from '../fixtures/seed-data';

test.beforeEach(({ clearDB }) => {
  clearDB();
  seedDatabase(DB_PATH, { documentCount: 3, groupCount: 0 });
  const db = new Database(DB_PATH);
  const text = Array.from({ length: 100 }, (_, i) => `syntheticword${i}`).join(' ');
  db.prepare('UPDATE document_content SET normalized_text=?,full_text=?,word_count=100').run(
    text,
    text,
  );
  db.prepare(
    "UPDATE document SET tags_json=CASE WHEN paperless_id=1 THEN '[\"Archive, keep\"]' ELSE '[]' END",
  ).run();
  db.close();
});
test.afterEach(({ clearDB }) => clearDB());

test('tag exclusions save in Settings and are counted by the real analysis worker', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  const input = page.getByLabel('Exclude documents with tags');
  await expect(input).toHaveValue('');
  await input.fill('ARCHIVE, KEEP');
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await expect(page.getByText(/Configuration saved/)).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  await expect(input).toHaveValue('ARCHIVE, KEEP');
  expect((await (await request.get('/api/v1/config/dedup')).json()).data.excludedTagNames).toEqual([
    'ARCHIVE, KEEP',
  ]);
  const response = await request.post('/api/v1/analysis', { data: { force: true } });
  expect(response.status()).toBe(202);
  const {
    data: { jobId },
  } = await response.json();
  const db = new Database(DB_PATH);
  try {
    await expect
      .poll(() => db.prepare('SELECT status FROM job WHERE id=?').get(jobId), { timeout: 20000 })
      .toEqual({ status: 'completed' });
    const row = db.prepare('SELECT result_json FROM job WHERE id=?').get(jobId) as {
      result_json: string;
    };
    expect(JSON.parse(row.result_json)).toMatchObject({
      documentsAnalyzed: 2,
      documentsSkipped: 1,
      skipReasons: { excludedByTag: 1 },
    });
    expect(
      db
        .prepare(
          "SELECT d.paperless_id FROM duplicate_member m JOIN document d ON d.id=m.document_id JOIN duplicate_group g ON g.id=m.group_id WHERE g.status='pending' ORDER BY d.paperless_id",
        )
        .all(),
    ).toEqual([{ paperless_id: 2 }, { paperless_id: 3 }]);
  } finally {
    db.close();
  }
  await page.goto('/');
  await page.getByText('1 skipped', { exact: true }).hover();
  await expect(page.getByText('Excluded by tag: 1', { exact: true })).toBeVisible();
});

test('generic config validates tag arrays and omitted dedup fields preserve them', async ({
  request,
}) => {
  expect(
    (
      await request.put('/api/v1/config', {
        data: { settings: { 'dedup.excludedTagNames': ['Synthetic tag'] } },
      })
    ).status(),
  ).toBe(200);
  expect((await request.put('/api/v1/config/dedup', { data: { minWords: 21 } })).status()).toBe(
    200,
  );
  for (const value of ['Synthetic tag', [1], ['']]) {
    const response = await request.put('/api/v1/config', {
      data: { settings: { 'dedup.excludedTagNames': value } },
    });
    expect(response.status()).toBe(400);
  }
  expect((await (await request.get('/api/v1/config/dedup')).json()).data.excludedTagNames).toEqual([
    'Synthetic tag',
  ]);
});

test('a rejected tag-exclusion save reports failure without persisting input', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Deduplication', exact: true }).click();
  await page.getByLabel('Exclude documents with tags').fill('not saved');
  await page.route('**/api/v1/config/dedup', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  await page.unroute('**/api/v1/config/dedup');
  expect((await (await request.get('/api/v1/config/dedup')).json()).data.excludedTagNames).toEqual(
    [],
  );
});
