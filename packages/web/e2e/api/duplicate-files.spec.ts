import Database from 'better-sqlite3';
import { test, expect, DB_PATH } from '../fixtures/test-app';

test('returns live file facts for group members without changing local documents', async ({
  request,
  seedDB,
  clearDB,
}) => {
  const seed = seedDB();
  const sqlite = new Database(DB_PATH);
  try {
    const before = sqlite.prepare('SELECT * FROM document ORDER BY id').all();
    const detail = (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json())
      .data;
    const response = await request.get(`/api/v1/duplicates/${seed.groupIds[0]}/files`);
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual({
      members: detail.members.map((member: { documentId: string; paperlessId: number }) => ({
        documentId: member.documentId,
        paperlessId: member.paperlessId,
        originalChecksum: 'abc123',
        originalSize: 1234,
        archiveSize: 5678,
        originalMimeType: 'application/pdf',
        hasArchive: true,
      })),
      identicalOriginals: true,
      reclaimableBytes: 6912,
    });
    expect(sqlite.prepare('SELECT * FROM document ORDER BY id').all()).toEqual(before);
    const missing = await request.get('/api/v1/duplicates/synthetic-missing/files');
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
  } finally {
    sqlite.close();
    clearDB();
  }
});

test('shows byte-identical originals and live file sizes on the detail page', async ({
  page,
  seedDB,
  clearDB,
}) => {
  const seed = seedDB();
  try {
    await page.goto(`/duplicates/${seed.groupIds[0]}`);
    await expect(page.getByText('Byte-identical originals', { exact: true })).toBeVisible();
    const originals = page
      .locator('dl > div')
      .filter({ has: page.locator('dt', { hasText: 'Original Size' }) });
    await expect(originals).toHaveCount(2);
    await expect(originals.first().locator('dd')).toHaveText('1,234 bytes');
    const archives = page
      .locator('dl > div')
      .filter({ has: page.locator('dt', { hasText: 'Archive Size' }) });
    await expect(archives.last().locator('dd')).toHaveText('5,678 bytes');
  } finally {
    clearDB();
  }
});
