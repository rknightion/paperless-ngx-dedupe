import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

test.beforeEach(async ({ seedDB }) => {
  seedDB();
});

test.afterEach(async ({ clearDB }) => {
  clearDB();
});

test('active job discovery filters lifecycle states and preserves the legacy list', async ({
  request,
}) => {
  const sqlite = new Database(DB_PATH);
  const activeIds = ['discovery-pending', 'discovery-running', 'discovery-paused'];
  try {
    const insert = sqlite.prepare(
      'INSERT INTO job (id, type, status, created_at) VALUES (?, ?, ?, ?)',
    );
    ['pending', 'running', 'paused'].forEach((status, index) => {
      insert.run(
        activeIds[index],
        ['sync', 'analysis', 'batch_operation'][index],
        status,
        `2030-01-01T00:00:0${index}.000Z`,
      );
    });
    sqlite.exec(
      'UPDATE job SET public_history_key = lower(hex(randomblob(16))) WHERE public_history_key IS NULL',
    );
  } finally {
    sqlite.close();
  }
  const legacyResponse = await request.get('/api/v1/jobs');
  expect(legacyResponse.status()).toBe(200);
  const legacy = (await legacyResponse.json()).data as Array<{ id: string; status: string }>;
  expect(legacy.some(({ status }) => status === 'completed')).toBe(true);
  const response = await request.get('/api/v1/jobs?active=true');
  expect(response.status()).toBe(200);
  const active = (await response.json()).data as Array<{ id: string; status: string }>;
  expect(active.map(({ id }) => id).sort()).toEqual(activeIds.sort());
  expect(active).toEqual(
    legacy.filter(({ status }) => ['pending', 'running', 'paused'].includes(status)),
  );
  for (const value of ['false', '', '1', 'TRUE']) {
    const invalid = await request.get(`/api/v1/jobs?active=${value}`);
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error.code).toBe('VALIDATION_FAILED');
  }
  const cursor = await request.get('/api/v1/jobs?pageSize=25&active=false');
  expect(cursor.status()).toBe(200);
  expect((await cursor.json()).meta).toHaveProperty('nextCursor');
});

test('browser discovery waits while hidden and resumes on visibility change', async ({ page }) => {
  const discoveryQueries: string[] = [];
  await page.route('**/api/v1/jobs?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/jobs') return route.continue();
    discoveryQueries.push(url.search);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await page.goto('/documents');
  await expect.poll(() => discoveryQueries.length).toBeGreaterThan(0);
  expect.soft(discoveryQueries.every((query) => query === '?active=true')).toBe(true);
  // Drive the browser's visibility input deterministically; observe actual fetch requests.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const beforeHidden = discoveryQueries.length;
  await page.waitForTimeout(4500);
  expect.soft(discoveryQueries).toHaveLength(beforeHidden);
  const beforeVisible = discoveryQueries.length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => discoveryQueries.length, { timeout: 1500 }).toBe(beforeVisible + 1);
});
