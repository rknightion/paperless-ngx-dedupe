import { test, expect } from './fixtures/test-app';
import type { SeedResult } from './fixtures/seed-data';
import Database from 'better-sqlite3';
import { DB_PATH } from './fixtures/test-app';

test.describe('Duplicate Detail Page', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads with group info', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // Page title should contain group info
    await expect(page).toHaveTitle(/Paperless NGX Dedupe/);

    // Header should show confidence badge
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('breadcrumb back link works', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    const backLink = page.locator('main').getByRole('link', { name: /Back to Duplicates/ });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/duplicates');
  });

  test('group header shows confidence and status badges', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // The header area should contain algorithm version text
    await expect(page.getByText(/Algorithm v/)).toBeVisible();
  });

  test('action bar renders with status action buttons', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // GroupActionBar should render action buttons for pending groups
    await expect(page.getByRole('button', { name: 'Not a Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Duplicates' })).toBeVisible();
  });

  test('members table lists all members', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // Members heading
    await expect(page.locator('h3', { hasText: 'Members' })).toBeVisible();

    // Members table should have headers
    const membersTable = page.locator('table').first();
    await expect(membersTable.getByText('Title')).toBeVisible();
    await expect(membersTable.getByText('Correspondent')).toBeVisible();
    await expect(membersTable.getByText('Role')).toBeVisible();

    // Should show primary badge for primary member (scoped to table to avoid matching ConfirmDialog)
    await expect(page.locator('table').getByText('Primary').first()).toBeVisible();
  });

  test('set primary button visible for non-primary members', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // The first group has 2 members, one non-primary should have "Set as Primary" button
    await expect(page.getByRole('button', { name: 'Set as Primary' })).toBeVisible();
  });

  test('selected primary persists after a reload', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    const members = page.locator('table').first().locator('tbody tr');
    const promotedTitle = (await members.nth(1).locator('td').first().textContent())?.trim();
    await members.nth(1).getByRole('button', { name: 'Set as Primary' }).click();
    const promotedRow = page
      .locator('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: promotedTitle ?? '' });
    await expect(promotedRow.getByText('Primary', { exact: true })).toBeVisible();

    await page.reload();
    const reloadedPrimaryRow = page
      .locator('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: promotedTitle ?? '' });
    await expect(reloadedPrimaryRow.getByText('Primary', { exact: true })).toBeVisible();
  });

  test('document comparison section renders', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    await expect(page.getByText('Document Comparison')).toBeVisible();
  });

  test('visual comparison uses browser-authorized thumbnail and PDF proxy URLs', async ({
    page,
    request,
  }) => {
    expect((await request.post('http://localhost:18923/__control__/reset')).ok()).toBe(true);
    const mediaResponses: Array<{ url: string; status: number; cacheControl: string }> = [];
    page.on('response', (response) => {
      if (/\/api\/v1\/paperless\/documents\/\d+\/(thumb|preview)/.test(response.url())) {
        mediaResponses.push({
          url: response.url(),
          status: response.status(),
          cacheControl: response.headers()['cache-control'],
        });
      }
    });

    await page.goto(`/duplicates/${seed.groupIds[0]}`);
    await expect
      .poll(() => mediaResponses.filter(({ url }) => url.includes('/thumb')).length)
      .toBe(2);

    const thumbnailResponses = mediaResponses.filter(({ url }) => url.includes('/thumb'));
    expect(thumbnailResponses).toHaveLength(2);
    for (const response of thumbnailResponses) {
      expect(response.url).toMatch(/\/thumb\?access=\d+\.[\w-]+$/);
      expect(response.url).not.toContain('test-token-e2e');
      expect(response.status).toBe(200);
      expect(response.cacheControl).toBe('private, max-age=3600');
    }

    const images = page.locator('img[src*="/thumb?access="]');
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }

    await page.getByRole('button', { name: 'View PDF' }).first().click();
    await expect
      .poll(() => mediaResponses.filter(({ url }) => url.includes('/preview')).length)
      .toBe(1);

    const previewResponse = mediaResponses.find(({ url }) => url.includes('/preview'));
    expect(previewResponse?.url).toMatch(/\/preview\?access=\d+\.[\w-]+$/);
    expect(previewResponse?.url).not.toContain('test-token-e2e');
    expect(previewResponse?.status).toBe(200);
    expect(previewResponse?.cacheControl).toBe('private, max-age=3600');
    const preview = await request.get(previewResponse!.url);
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-type']).toBe('application/pdf');
    expect((await preview.body()).subarray(0, 8).toString()).toBe('%PDF-1.4');

    const tampered = new URL(previewResponse!.url);
    const [expiresAt, signature] = tampered.searchParams.get('access')!.split('.');
    const replacement = signature[0] === 'A' ? 'B' : 'A';
    tampered.searchParams.set('access', `${expiresAt}.${replacement}${signature.slice(1)}`);
    const rejected = await request.get(tampered.toString());
    expect(rejected.status()).toBe(401);
    expect((await rejected.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('confidence breakdown section renders', async ({ page }) => {
    const groupId = seed.groupIds[0];
    await page.goto(`/duplicates/${groupId}`);

    // ConfidenceBreakdown heading
    await expect(page.getByText('Confidence Breakdown')).toBeVisible();
  });

  test('shows why documents matched and their key differences', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const db = new Database(DB_PATH);
    db.prepare('UPDATE document_content SET normalized_text = ? WHERE document_id = ?').run(
      'invoice number inv-2024-001 date 15/01/2024 total £1234.56 from lhr to jfk',
      seed.documentIds[0],
    );
    db.prepare('UPDATE document_content SET normalized_text = ? WHERE document_id = ?').run(
      'invoice number inv-2024-001 date 16/01/2024 total £1234.56 from jfk to lhr',
      seed.documentIds[1],
    );
    db.close();

    await page.goto(`/duplicates/${seed.groupIds[0]}`);

    const explanation = page.getByRole('region', { name: 'Match explanation' });
    await expect(explanation.getByRole('heading', { name: 'Why these matched' })).toBeVisible();
    await expect(explanation.getByText('1234.56')).toBeVisible();
    await expect(explanation.getByRole('heading', { name: 'Key differences' })).toBeVisible();
    await expect(explanation.getByText('lhr → jfk')).toBeVisible();
    await expect(explanation.getByText('jfk → lhr')).toBeVisible();
  });

  test('404 for non-existent group', async ({ page }) => {
    const response = await page.goto('/duplicates/nonexistent-id');
    expect(response?.status()).toBe(404);
  });

  test('group with 3 members shows secondary selector', async ({ page }) => {
    // Group 2 has 3 members
    const groupId = seed.groupIds[1];
    await page.goto(`/duplicates/${groupId}`);

    // With 3 members (1 primary + 2 secondary), secondary selector buttons should appear
    await expect(page.getByText('Document Comparison')).toBeVisible();
  });
});

test.describe('Next duplicate in the review queue', () => {
  let seed: SeedResult;
  test.beforeEach(({ seedDB }) => {
    seed = seedDB();
    const db = new Database(DB_PATH);
    db.prepare("UPDATE duplicate_group SET status='pending'").run();
    db.close();
  });
  test.afterEach(({ clearDB }) => clearDB());

  test('queue API metadata is additive, positional and validates filters', async ({ request }) => {
    const path = `/api/v1/duplicates/${seed.groupIds[0]}`;
    const original = await (await request.get(path)).json();
    expect(original).not.toHaveProperty('meta');
    const queued = await (await request.get(`${path}?queue=pending`)).json();
    expect(queued).toEqual({ ...original, meta: { nextGroupId: seed.groupIds[1] } });
    expect(
      (await (await request.get(`${path}?queue=ambiguous&correspondent=Alice%20Corp`)).json()).meta
        .nextGroupId,
    ).toBe(seed.groupIds[1]);
    for (const query of [
      'queue=invalid',
      'queue=pending&correspondent=',
      'queue=pending&correspondent=' + 'x'.repeat(201),
    ]) {
      const response = await request.get(`${path}?${query}`);
      expect(response.status()).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
    }
    await request.put(`${path}/status`, { data: { status: 'false_positive' } });
    expect((await (await request.get(`${path}?queue=pending`)).json()).meta.nextGroupId).toBe(
      seed.groupIds[1],
    );
  });

  for (const action of ['Not a Duplicate', 'Keep All'])
    test(`${action} advances and preserves return filters`, async ({ page, request }) => {
      const returnParams = 'queue=pending&correspondent=Alice+Corp&minConfidence=0.9';
      await page.goto(
        `/duplicates/${seed.groupIds[0]}?returnParams=${encodeURIComponent(returnParams)}`,
      );
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(page).toHaveURL(
        `/duplicates/${seed.groupIds[1]}?returnParams=${encodeURIComponent(returnParams)}`,
      );
      expect(
        (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
      ).toBe(action === 'Keep All' ? 'ignored' : 'false_positive');
    });

  test('Skip changes no status and the last group offers the return link', async ({
    page,
    request,
  }) => {
    await page.goto(`/duplicates/${seed.groupIds[0]}`);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(`/duplicates/${seed.groupIds[1]}?returnParams=`);
    expect(
      (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
    ).toBe('pending');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(`/duplicates/${seed.groupIds[2]}?returnParams=`);
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Not a Duplicate', exact: true }).click();
    await expect(page.getByText('Queue empty', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return to queue', exact: true })).toHaveAttribute(
      'href',
      '/duplicates',
    );
  });

  test('the auto-advance preference persists and invalid return filters use pending', async ({
    page,
    request,
  }) => {
    const path = `/duplicates/${seed.groupIds[0]}?returnParams=${encodeURIComponent('queue=invalid&correspondent=')}`;
    await page.goto(path);
    const toggle = page.getByLabel('Go to next group after an action');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await page.getByRole('button', { name: 'Keep All', exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
      )
      .toBe('ignored');
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(
      `/duplicates/${seed.groupIds[1]}?returnParams=${encodeURIComponent('queue=invalid&correspondent=')}`,
    );
  });
});

test.describe('Duplicate review shortcuts', () => {
  let seed: SeedResult;
  test.beforeEach(({ seedDB }) => {
    seed = seedDB();
    const db = new Database(DB_PATH);
    db.prepare("UPDATE duplicate_group SET status='pending'").run();
    db.close();
  });
  test.afterEach(({ clearDB }) => clearDB());

  test('n resolves the group and advances with the current filters', async ({ page, request }) => {
    await page.goto(`/duplicates/${seed.groupIds[0]}?returnParams=queue%3Dpending`);
    await expect(page.getByRole('button', { name: 'Not a Duplicate', exact: true })).toBeVisible();
    await page.keyboard.press('n');
    await expect(page).toHaveURL(`/duplicates/${seed.groupIds[1]}?returnParams=queue%3Dpending`);
    expect(
      (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
    ).toBe('false_positive');
  });

  test('d only opens confirmation and typing, dialogs and modifiers block actions', async ({
    page,
    request,
  }) => {
    const db = new Database(DB_PATH);
    try {
      await page.goto(`/duplicates/${seed.groupIds[0]}`);
      await expect(
        page.getByRole('button', { name: 'Not a Duplicate', exact: true }),
      ).toBeVisible();
      const before = db.prepare('SELECT COUNT(*) AS count FROM document').get();
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.setAttribute('aria-label', 'Synthetic typing target');
        document.querySelector('main')!.append(input);
        input.focus();
      });
      await page.keyboard.type('nkds?p');
      await expect(page.getByLabel('Synthetic typing target')).toHaveValue('nkds?p');
      await page.getByLabel('Synthetic typing target').evaluate((e) => e.remove());
      for (const key of ['Control+n', 'Alt+k', 'Meta+d', 'Shift+N', 'Shift+?'])
        await page.keyboard.press(key);
      expect(
        (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
      ).toBe('pending');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.keyboard.press('d');
      const dialog = page.getByRole('dialog', {
        name: 'Delete Non-Primary Documents',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('n');
      await page.keyboard.press('k');
      await page.keyboard.press('s');
      expect(
        (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
      ).toBe('pending');
      expect(db.prepare('SELECT COUNT(*) AS count FROM document').get()).toEqual(before);
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM job WHERE type='batch_operation'").get(),
      ).toEqual({ count: 0 });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).not.toBeVisible();
    } finally {
      db.close();
    }
  });

  test('question mark opens help and keeps review actions inactive until closed', async ({
    page,
    request,
  }) => {
    await page.goto(`/duplicates/${seed.groupIds[0]}`);
    await expect(
      page.getByRole('button', { name: 'Keyboard shortcuts (?)', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
    await expect(help).toBeVisible();
    for (const key of ['n', 'k', 'd', 's', '1–9', 'p', '?'])
      await expect(
        help.locator('kbd').filter({ hasText: new RegExp(`^${key.replace('?', '\\?')}$`) }),
      ).toBeVisible();
    await page.keyboard.press('n');
    expect(
      (await (await request.get(`/api/v1/duplicates/${seed.groupIds[0]}`)).json()).data.status,
    ).toBe('pending');
    await page.keyboard.press('Escape');
    await expect(help).not.toBeVisible();
    await page.keyboard.press('s');
    await expect(page).toHaveURL(`/duplicates/${seed.groupIds[1]}?returnParams=`);
    await page.keyboard.press('k');
    await expect(page).toHaveURL(`/duplicates/${seed.groupIds[2]}?returnParams=`);
    expect(
      (await (await request.get(`/api/v1/duplicates/${seed.groupIds[1]}`)).json()).data.status,
    ).toBe('ignored');
  });
  test('number keys select a comparison document and p persists it as primary', async ({
    page,
    request,
  }) => {
    const path = `/api/v1/duplicates/${seed.groupIds[1]}`;
    const before = (await (await request.get(path)).json()).data;
    const secondary = before.members.filter((member: { isPrimary: boolean }) => !member.isPrimary);
    await page.goto(`/duplicates/${seed.groupIds[1]}`);
    await expect(
      page.getByRole('button', { name: 'Keyboard shortcuts (?)', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('2');
    await page.keyboard.press('p');
    await expect
      .poll(
        async () =>
          (await (await request.get(path)).json()).data.members.find(
            (member: { isPrimary: boolean }) => member.isPrimary,
          ).documentId,
      )
      .toBe(secondary[1].documentId);
    await page.reload();
    const promoted = page
      .locator('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: secondary[1].title });
    await expect(promoted.getByText('Primary', { exact: true })).toBeVisible();
  });
});
