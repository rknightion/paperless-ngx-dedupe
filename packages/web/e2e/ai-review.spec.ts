import { test, expect, DB_PATH } from './fixtures/test-app';
import Database from 'better-sqlite3';

function seedAiReviewData(documentIds: string[]): void {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('ai.addProcessedTag', 'true', ?)`,
  ).run(now);

  const insert = db.prepare(`
    INSERT INTO ai_processing_result (
      id, document_id, paperless_id, provider, model, suggested_title,
      suggested_correspondent, suggested_tags_json, confidence_json,
      current_title, current_correspondent, current_tags_json,
      applied_status, failure_type, error_message, evidence, created_at,
      applied_at, applied_fields_json, pre_apply_title, applied_title
    ) VALUES (?, ?, ?, 'openai', 'e2e-model', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    'ai-review-one',
    documentIds[0],
    1,
    'Reviewed title one',
    'Alice Corp',
    '["finance"]',
    '{"title":0.9,"correspondent":0.8,"documentType":0.7,"tags":0.9}',
    'Test Document 1',
    null,
    '["important"]',
    'pending_review',
    null,
    null,
    'Bounded evidence '.repeat(60),
    '2026-01-03T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  insert.run(
    'ai-review-two',
    documentIds[1],
    2,
    'Reviewed title two',
    null,
    null,
    '{"title":0.7,"correspondent":0,"documentType":0,"tags":0}',
    'Test Document 2',
    null,
    null,
    'pending_review',
    null,
    null,
    'Second result',
    '2026-01-02T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  insert.run(
    'ai-review-failure',
    documentIds[2],
    3,
    null,
    null,
    null,
    null,
    'Test Document 3',
    null,
    null,
    'failed',
    'timeout',
    'RAW_PRIVATE_UPSTREAM_EXCEPTION',
    null,
    '2026-01-01T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  insert.run(
    'ai-review-audit',
    documentIds[3],
    4,
    'Reviewed Document 4',
    null,
    null,
    '{"title":0.9,"correspondent":0,"documentType":0,"tags":0}',
    'Test Document 4',
    null,
    null,
    'partial',
    null,
    null,
    'Applied after human review',
    '2025-12-31T00:00:00.000Z',
    '2026-01-04T00:00:00.000Z',
    '["title"]',
    'Test Document 4',
    'Reviewed Document 4',
  );
  insert.run(
    'ai-review-skipped',
    documentIds[4],
    5,
    null,
    null,
    null,
    null,
    'Test Document 5',
    null,
    null,
    'skipped',
    'no_content',
    'RAW_SKIPPED_PRIVATE_ERROR',
    null,
    '2025-12-30T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  insert.run(
    'ai-review-rejected',
    documentIds[5],
    6,
    'Rejected title',
    null,
    null,
    '{"title":0.8,"correspondent":0,"documentType":0,"tags":0}',
    'Test Document 6',
    null,
    null,
    'rejected',
    null,
    null,
    null,
    '2025-12-29T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  insert.run(
    'ai-review-conflict',
    documentIds[6],
    7,
    'Conflict title',
    null,
    null,
    '{"title":0.8,"correspondent":0,"documentType":0,"tags":0}',
    'Test Document 7',
    null,
    null,
    'failed',
    'review_conflict',
    'RAW_CONFLICT_PRIVATE_ERROR',
    'Conflict requires review',
    '2025-12-28T00:00:00.000Z',
    null,
    null,
    null,
    null,
  );
  db.close();
}

test.describe('unified AI review inbox', () => {
  test.beforeEach(async ({ seedDB }) => {
    const seed = seedDB();
    seedAiReviewData(seed.documentIds);
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('reviews explicit fields and creates a token-backed batch preview', async ({ page }) => {
    await page.goto('/ai-processing/review?queue=review&limit=20');
    const detailResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/ai/results/ai-review-one?mode=inbox'),
    );
    await page.getByRole('row').filter({ hasText: 'Test Document 1' }).click();
    expect((await detailResponse).status()).toBe(200);

    await expect(page.getByRole('group', { name: 'Choose fields to apply' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Apply title' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Apply correspondent' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Add processed tag' })).not.toBeChecked();
    await expect(page.getByText('Bounded evidence '.repeat(40))).not.toBeVisible();
    await expect(page.getByText('RAW_OCR_SECRET')).not.toBeVisible();
    await expect(page.getByText('Some values were shortened for safe review.')).toBeVisible();

    const previewRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/api/v1/ai/results/preflight') && request.method() === 'POST',
    );
    await page.keyboard.press('a');
    const request = await previewRequest;
    expect(request.postDataJSON()).toMatchObject({
      scope: { type: 'selected_result_ids', resultIds: ['ai-review-one'] },
      selection: {
        title: true,
        correspondent: false,
        processedTag: false,
      },
    });
    await expect(page.getByRole('heading', { name: 'Apply to 1 document' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('checkbox', { name: 'Select Test Document 1' }).check();
    await page.getByRole('checkbox', { name: 'Select Test Document 2' }).check();
    await page
      .getByRole('group', { name: 'Fields for selected documents' })
      .getByText('Title', { exact: true })
      .click();
    const batchPreview = page.waitForRequest(
      (next) => next.url().endsWith('/api/v1/ai/results/preflight') && next.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Review selected fields' }).click();
    expect((await batchPreview).postDataJSON()).toEqual({
      scope: {
        type: 'selected_result_ids',
        resultIds: ['ai-review-one', 'ai-review-two'],
      },
      selection: {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      allowClearing: false,
      createMissingEntities: true,
    });
    await expect(page.getByRole('heading', { name: 'Apply to 2 documents' })).toBeVisible();
  });

  test('preserves explicit selections while paging the cursor inbox', async ({ page }) => {
    await page.goto('/ai-processing/review?queue=review&limit=2');
    await page.getByRole('checkbox', { name: 'Select Test Document 1' }).check();
    await page.getByRole('button', { name: 'Next AI results' }).click();
    await page.getByRole('checkbox', { name: 'Select Test Document 2' }).check();

    await expect(page.getByText('2 selected across pages')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select all visible AI results' }).uncheck();
    await expect(page.getByText('1 selected across pages')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select Test Document 2' }).check();
    await page.getByTitle('Reject suggestions').click();
    await expect(page.getByText('1 selected across pages')).toBeVisible();
  });

  test('targets skipped, rejected, and review-conflict documents exactly', async ({ page }) => {
    // Resolve the stable internal IDs from the local database to exercise the
    // same document-targeted links as the library.
    const db = new Database(DB_PATH);
    const rows = db
      .prepare(
        `SELECT id, title FROM document WHERE paperless_id IN (5, 6, 7) ORDER BY paperless_id`,
      )
      .all() as Array<{ id: string; title: string }>;
    db.close();

    for (const [queue, row] of [
      ['failures', rows[0]],
      ['history', rows[1]],
      ['review', rows[2]],
    ] as const) {
      await page.goto(
        `/ai-processing/review?queue=${queue}&documentId=${encodeURIComponent(row.id)}&returnTo=${encodeURIComponent('/documents?library=true')}`,
      );
      const exactResult =
        queue === 'failures'
          ? page.getByRole('button', { name: new RegExp(row.title) })
          : page.getByRole('row').filter({ hasText: row.title });
      await expect(exactResult).toHaveCount(1);
      await expect(page.getByText(/Test Document [1-4]/)).toHaveCount(0);
      await page.getByRole('link', { name: 'Return to documents' }).click();
      await expect(page).toHaveURL(/\/documents\?library=true$/);
    }
  });

  test('groups extraction failures safely and retries only the visible category', async ({
    page,
  }) => {
    await page.route('**/api/v1/ai/results/ai-review-failure/reprocess**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
    });
    await page.goto('/ai-processing/review?queue=failures&failureCategory=temporary&limit=20');

    await expect(page.getByRole('heading', { name: 'Temporary service issue' })).toBeVisible();
    await expect(page.getByText('RAW_PRIVATE_UPSTREAM_EXCEPTION')).not.toBeVisible();
    const retry = page.waitForRequest((request) =>
      request.url().includes('ai-review-failure/reprocess'),
    );
    await page.getByRole('button', { name: 'Retry visible' }).click();
    await retry;
    await expect(page.getByText('Extraction retried successfully')).toBeVisible();
  });

  test('shows audit data and executes a reviewed revert from a mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fetch('http://localhost:18923/api/documents/4/', {
      method: 'PATCH',
      headers: {
        Authorization: 'Token test-token-e2e',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Reviewed Document 4' }),
    });
    await page.goto('/ai-processing/review?queue=history&limit=20');
    const detailResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/ai/results/ai-review-audit?mode=inbox'),
    );
    await page.getByRole('button', { name: /Test Document 4 Partial/ }).click();
    expect((await detailResponse).status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Apply Audit' })).toBeVisible();
    await expect(page.getByText('title', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revert selected audited fields' }).click();

    await expect
      .poll(async () => {
        const response = await fetch('http://localhost:18923/api/documents/4/', {
          headers: { Authorization: 'Token test-token-e2e' },
        });
        return ((await response.json()) as { title: string }).title;
      })
      .toBe('Test Document 4');
  });

  test('keeps keyboard mutations aligned with drawer eligibility', async ({ page }) => {
    const mutationRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        (request.url().includes('/preflight') || request.url().includes('/reject'))
      ) {
        mutationRequests.push(request.url());
      }
    });

    await page.goto('/ai-processing/review?queue=failures&documentId=');
    await page.getByRole('button', { name: /Test Document 3/ }).click();
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await page.keyboard.press('/');
    await expect(page.getByRole('textbox', { name: 'Search documents' })).toBeFocused();
    expect(mutationRequests).toEqual([]);

    const db = new Database(DB_PATH);
    const historyId = db.prepare('SELECT id FROM document WHERE paperless_id = 4').pluck().get();
    const conflictId = db.prepare('SELECT id FROM document WHERE paperless_id = 7').pluck().get();
    db.close();

    await page.goto(
      `/ai-processing/review?queue=history&documentId=${encodeURIComponent(String(historyId))}`,
    );
    await page.getByRole('row').filter({ hasText: 'Test Document 4' }).click();
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await page.keyboard.press('j');
    expect(mutationRequests).toEqual([]);

    await page.goto(
      `/ai-processing/review?queue=review&documentId=${encodeURIComponent(String(conflictId))}`,
    );
    await page.getByRole('row').filter({ hasText: 'Test Document 7' }).click();
    await expect(page.getByRole('checkbox', { name: 'Apply title' })).toBeVisible();
    const preflight = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/preflight'),
    );
    await page.keyboard.press('a');
    expect((await preflight).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Apply to 1 document' })).toBeVisible();
  });
});
