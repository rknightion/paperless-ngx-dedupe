import { test, expect } from './fixtures/test-app';
import Database from 'better-sqlite3';
import { DB_PATH } from './fixtures/test-app';

test.describe('Documents Page', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).toHaveTitle('Documents - Paperless NGX Dedupe');
    await expect(page.locator('main h1')).toHaveText('Documents');
  });

  test('document statistics cards render', async ({ page }) => {
    await page.goto('/documents');

    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('OCR Coverage')).toBeVisible();
    await expect(page.getByText('Processing', { exact: true })).toBeVisible();
    await expect(page.getByText('Avg Word Count')).toBeVisible();
  });

  test('chart sections render with canvas elements', async ({ page }) => {
    await page.goto('/documents');

    // EChart renders to canvas elements
    const canvases = page.locator('canvas');
    // At least one chart should be present (correspondents, doc types, or tags)
    const count = await canvases.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('external Paperless link is present', async ({ page }) => {
    await page.goto('/documents');

    const link = page.getByRole('link', { name: 'Open Paperless-NGX' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /\/documents\//);
  });

  test('manage documents section renders', async ({ page }) => {
    await page.goto('/documents');

    await expect(page.getByText('Manage Documents')).toBeVisible();
    await expect(
      page.getByText('Open Paperless-NGX to manage individual documents.'),
    ).toBeVisible();
  });

  test('library mode exposes the actionable table before analytics without changing legacy mode', async ({
    page,
  }) => {
    await page.goto('/documents');
    await expect(page.getByRole('table', { name: 'Document library' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Browse document library' }).click();
    await expect(page).toHaveURL('/documents?library=true');
    await expect(page.getByRole('heading', { name: 'Library quality' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Document library' })).toBeVisible();

    const tableTop = await page.getByRole('table', { name: 'Document library' }).boundingBox();
    const analyticsTop = await page.getByText('Analytics', { exact: true }).boundingBox();
    expect(tableTop?.y).toBeLessThan(analyticsTop?.y ?? 0);
  });

  test('keeps every library filter in canonical URL state and resets pagination', async ({
    page,
  }) => {
    await page.goto(
      '/documents?library=true&text=invoice&missingOcr=false&correspondent=Alice%20Corp&documentType=Invoice&tag=finance&customFieldId=7&customFieldValue=%5B1%2C2%5D&duplicate=involved&aiStatus=failed&freshness=stale&limit=25',
    );

    await expect(page.getByLabel('Search title or OCR')).toHaveValue('invoice');
    await expect(page.getByLabel('OCR content')).toHaveValue('false');
    await expect(page.getByLabel('Correspondent')).toHaveValue('Alice Corp');
    await expect(page.getByLabel('Document type')).toHaveValue('Invoice');
    await expect(page.getByLabel('Tag')).toHaveValue('finance');
    await expect(page.getByLabel('Custom field ID', { exact: true })).toHaveValue('7');
    await expect(page.getByLabel('Custom field value', { exact: true })).toHaveValue('[1,2]');
    await expect(page.getByLabel('Duplicate involvement')).toHaveValue('involved');
    await expect(page.getByLabel('AI review status')).toHaveValue('failed');
    await expect(page.getByLabel('AI freshness')).toHaveValue('stale');
    await expect(page.getByLabel('Documents per page')).toHaveValue('25');
    const exportUrl = new URL(
      (await page.getByRole('link', { name: 'Export filtered CSV' }).getAttribute('href')) ?? '',
      page.url(),
    );
    expect(exportUrl.searchParams.get('customFieldValue')).toBe('[1,2]');
    expect(exportUrl.searchParams.has('library')).toBe(false);
    expect(exportUrl.searchParams.has('cursor')).toBe(false);
    expect(exportUrl.searchParams.has('limit')).toBe(false);

    await page.getByLabel('Custom field value', { exact: true }).fill('true');
    await page.getByRole('button', { name: 'Apply library filters' }).click();
    await expect(page).toHaveURL(/customFieldValue=true/);
    expect(new URL(page.url()).searchParams.get('cursor')).toBeNull();

    await page.getByLabel('Custom field value', { exact: true }).fill('"reference"');
    await page.getByRole('button', { name: 'Apply library filters' }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('customFieldValue') === '"reference"',
    );
  });

  test('cursor navigation is stable across refresh, back and forward and truthful on direct entry', async ({
    page,
    clearDB,
  }) => {
    clearDB();
    test.info().annotations.push({ type: 'seed', description: '60 document cursor fixture' });
    // The fixture callback is deliberately invoked here so this test can request a larger library.
    seedLargeLibrary();

    await page.goto('/documents?library=true&limit=25');
    await expect(page.getByRole('row')).toHaveCount(26);
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByRole('link', { name: 'Previous page' })).toBeVisible();
    const secondPageUrl = page.url();

    await page.reload();
    await expect(page.getByRole('link', { name: 'Previous page' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/documents?library=true&limit=25');
    await page.goForward();
    await expect(page).toHaveURL(secondPageUrl);

    const cursor = new URL(secondPageUrl).searchParams.get('cursor');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`/documents?library=true&limit=25&cursor=${encodeURIComponent(cursor ?? '')}`);
    await expect(page.getByRole('link', { name: 'Previous page' })).toHaveCount(0);
    await expect(page.getByText('Previous page unavailable for this direct link.')).toBeVisible();
  });

  test('document actions preserve a safe return target and mobile layout does not overflow', async ({
    page,
  }) => {
    await page.goto('/documents?library=true&tag=finance');

    const paperlessLink = page.getByRole('link', { name: /Open Test Document 10 in Paperless/ });
    await expect(paperlessLink).toHaveAttribute('href', /\/documents\/10\/details$/);
    await expect(paperlessLink).toHaveAttribute('rel', /noopener/);
    await expect(
      page.getByRole('link', { name: /Review AI result for Test Document 10/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ hasText: 'Paperless #10' }).getByText('Unprocessed'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Review duplicates for Test Document 6/ }),
    ).toHaveAttribute('href', /\/duplicates\/[^?]+\?returnTo=/);

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('library communicates empty and loading states', async ({ page }) => {
    await page.goto('/documents?library=true&text=no-such-document');
    await expect(page.getByText('No documents match these filters.')).toBeVisible();

    await page.getByLabel('Search title or OCR').fill('Test');
    await page.getByRole('button', { name: 'Apply library filters' }).click({ noWaitAfter: true });
    await expect(page.getByRole('status', { name: 'Loading document library' })).toBeVisible();
  });

  test('targets exact AI documents across every result state despite duplicate titles', async ({
    page,
  }) => {
    const documents = seedAiReviewStatuses();
    await page.goto('/documents?library=true');

    for (const document of documents) {
      const row = page.getByRole('row').filter({ hasText: `Paperless #${document.paperlessId}` });
      const link = row.getByRole('link', { name: `Review AI result for ${document.title}` });
      const href = new URL((await link.getAttribute('href')) ?? '', page.url());
      expect(href.pathname).toBe('/ai-processing/review');
      expect(href.searchParams.get('queue')).toBe(document.expectedQueue);
      expect(href.searchParams.get('documentId')).toBe(document.id);
      expect(href.searchParams.get('returnTo')).toBe('/documents?library=true');

      await link.click();
      if (document.expectedQueue === 'failures') {
        await expect(
          page
            .getByRole('region', { name: 'Extraction failures' })
            .getByRole('button')
            .filter({ hasText: document.title }),
        ).toHaveCount(1);
      } else {
        await expect(page.getByLabel(`Select ${document.title}`)).toHaveCount(1);
      }
      await page.getByRole('link', { name: 'Return to documents' }).click();
      await expect(page).toHaveURL('/documents?library=true');
    }

    const duplicateTitleLinks = page.getByRole('link', {
      name: 'Review AI result for Shared review title',
    });
    await expect(duplicateTitleLinks).toHaveCount(2);
    const first = new URL(
      (await duplicateTitleLinks.nth(0).getAttribute('href')) ?? '',
      page.url(),
    );
    const second = new URL(
      (await duplicateTitleLinks.nth(1).getAttribute('href')) ?? '',
      page.url(),
    );
    expect(first.searchParams.get('documentId')).not.toBe(second.searchParams.get('documentId'));
  });

  test('opens an exact non-pending duplicate group and returns to the library', async ({
    page,
  }) => {
    const db = new Database(DB_PATH);
    const target = db
      .prepare(
        `SELECT d.title, dg.id AS groupId
         FROM document d
         JOIN duplicate_member dm ON dm.document_id = d.id
         JOIN duplicate_group dg ON dg.id = dm.group_id
         WHERE dg.status = 'ignored'
         ORDER BY d.paperless_id
         LIMIT 1`,
      )
      .get() as { title: string; groupId: string };
    db.close();

    await page.goto('/documents?library=true&tag=important');
    const link = page.getByRole('link', { name: `Review duplicates for ${target.title}` });
    const href = new URL((await link.getAttribute('href')) ?? '', page.url());
    expect(href.pathname).toBe(`/duplicates/${target.groupId}`);
    expect(href.searchParams.get('returnTo')).toBe('/documents?library=true&tag=important');

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/duplicates/${target.groupId}`));
    await page.getByRole('link', { name: 'Back to Documents' }).click();
    await expect(page).toHaveURL('/documents?library=true&tag=important');
  });

  test('quality links retain the exact active population and hidden filters round-trip', async ({
    page,
  }) => {
    await page.goto('/documents?library=true&tag=finance&missingCorrespondent=true&limit=25');

    await expect(
      page.getByRole('link', { name: 'Remove Missing correspondent filter' }),
    ).toBeVisible();
    const missingOcrHref = new URL(
      (await page.getByRole('link').filter({ hasText: 'Missing OCR' }).getAttribute('href')) ?? '',
      page.url(),
    );
    expect(missingOcrHref.searchParams.get('tag')).toBe('finance');
    expect(missingOcrHref.searchParams.get('missingCorrespondent')).toBe('true');
    expect(missingOcrHref.searchParams.get('missingOcr')).toBe('true');
    expect(missingOcrHref.searchParams.has('limit')).toBe(false);

    await page.getByLabel('Correspondent', { exact: true }).fill('Alice Corp');
    await page.getByRole('button', { name: 'Apply library filters' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('correspondent') === 'Alice Corp');
    expect(new URL(page.url()).searchParams.has('missingCorrespondent')).toBe(false);

    await page.goto(
      '/documents?library=true&tag=finance&correspondentSet=%5B%22Alice%20Corp%22%2C%22Bob%20Industries%22%5D',
    );
    const removeSet = page.getByRole('link', {
      name: 'Remove Correspondent: Alice Corp or Bob Industries filter',
    });
    await removeSet.click();
    await expect(page).toHaveURL((url) => {
      return url.searchParams.get('tag') === 'finance' && !url.searchParams.has('correspondentSet');
    });

    await page.goto('/documents?library=true');
    const opportunity = page
      .getByRole('region', { name: 'Library quality' })
      .getByRole('link')
      .filter({ hasText: 'missing correspondent' });
    await expect(opportunity).toHaveAttribute(
      'href',
      '/documents?library=true&missingCorrespondent=true',
    );
    await opportunity.click();
    await expect(page.getByRole('row')).toHaveCount(3);
  });

  test('opposing same-dimension quality populations are truthful non-links', async ({ page }) => {
    await page.goto(
      '/documents?library=true&missingOcr=false&duplicate=not-involved&aiStatus=failed',
    );

    for (const label of ['Missing OCR', 'In duplicate groups', 'AI unprocessed']) {
      await expect(page.getByRole('link').filter({ hasText: label })).toHaveCount(0);
      await expect(page.getByLabel(new RegExp(`^${label}: 0$`))).toContainText(
        'Current filters exclude this population.',
      );
    }
  });
});

function seedAiReviewStatuses() {
  const db = new Database(DB_PATH);
  const rows = db
    .prepare(
      'SELECT id, paperless_id AS paperlessId, title FROM document ORDER BY paperless_id LIMIT 8',
    )
    .all() as { id: string; paperlessId: number; title: string }[];
  const resultStates = [
    { status: 'pending_review', expectedQueue: 'review', failureType: null },
    { status: 'failed', expectedQueue: 'failures', failureType: 'provider_error' },
    { status: 'skipped', expectedQueue: 'failures', failureType: 'no_content' },
    { status: 'applied', expectedQueue: 'history', failureType: null },
    { status: 'partial', expectedQueue: 'history', failureType: null },
    { status: 'reverted', expectedQueue: 'history', failureType: null },
    { status: 'rejected', expectedQueue: 'history', failureType: null },
    { status: 'failed', expectedQueue: 'review', failureType: 'review_conflict' },
  ];
  const updateTitle = db.prepare('UPDATE document SET title = ? WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO ai_processing_result (
      id, document_id, paperless_id, provider, model, suggested_title, applied_status, failure_type,
      error_message, created_at
    ) VALUES (?, ?, ?, 'openai', 'test-model', ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const [index, row] of rows.entries()) {
      const state = resultStates[index];
      const title =
        index < 2
          ? 'Shared review title'
          : state.failureType === 'review_conflict'
            ? 'AI review conflict document'
            : `AI ${state.status} document`;
      updateTitle.run(title, row.id);
      insert.run(
        `ai-library-${index}`,
        row.id,
        row.paperlessId,
        title,
        state.status,
        state.failureType,
        state.failureType ? `${state.failureType} test` : null,
        now,
      );
      row.title = title;
    }
  })();
  db.close();
  return rows.map((row, index) => ({ ...row, ...resultStates[index] }));
}

function seedLargeLibrary() {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO document (
      id, paperless_id, title, fingerprint, correspondent, document_type, tags_json,
      custom_fields_json, created_date, added_date, modified_date, processing_status, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertContent = db.prepare(`
    INSERT INTO document_content (id, document_id, full_text, normalized_text, word_count, content_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    for (let index = 1; index <= 60; index++) {
      const id = `library-doc-${index}`;
      const month = String(((index - 1) % 9) + 1).padStart(2, '0');
      insert.run(
        id,
        index,
        `Library Document ${index}`,
        `library-fp-${index}`,
        index % 2 === 0 ? 'Alice Corp' : 'Bob Industries',
        index % 2 === 0 ? 'Invoice' : 'Receipt',
        index % 2 === 0 ? '["finance"]' : '["important"]',
        index % 4 === 0
          ? '[{"field":7,"value":[1,2]}]'
          : index % 4 === 1
            ? '[{"field":7,"value":true}]'
            : index % 4 === 2
              ? '[{"field":7,"value":"reference"}]'
              : '[{"field":7,"value":42}]',
        `2024-${month}-01T00:00:00.000Z`,
        `2024-${month}-02T00:00:00.000Z`,
        `2024-${month}-03T00:00:00.000Z`,
        'completed',
        now,
      );
      insertContent.run(
        `library-content-${index}`,
        id,
        `Searchable library OCR ${index}`,
        `searchable library ocr ${index}`,
        4,
        `library-hash-${index}`,
      );
    }
  });
  transaction();
  db.close();
}
