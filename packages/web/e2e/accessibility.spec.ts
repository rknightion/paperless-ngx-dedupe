import AxeBuilder from '@axe-core/playwright';
import Database from 'better-sqlite3';
import { DB_PATH, expect, test } from './fixtures/test-app';

const missingPage = '/accessibility-test-missing';
const routes = [
  ['/', 'Dashboard'],
  ['/documents', 'Documents'],
  ['/documents?library=true', 'Document Library'],
  ['/duplicates', 'Duplicate Groups'],
  ['/duplicates/[id]', 'Document Comparison'],
  ['/duplicates/graph', 'Similarity Graph'],
  ['/duplicates/wizard', 'Bulk Operations Wizard'],
  ['/jobs', 'Job History'],
  ['/settings', 'Settings'],
  ['/ai-processing', 'AI processing'],
  ['/ai-processing/queue', 'Unprocessed documents'],
  ['/ai-processing/review', 'AI processing'],
  ['/ai-processing/history', 'AI processing'],
  ['/ai-processing/custom-fields', 'Discover custom fields'],
  [missingPage, 'Page not found'],
] as const;

function seedAiResults(documentIds: string[]): void {
  const db = new Database(DB_PATH);
  try {
    const insert = db.prepare(`
      INSERT INTO ai_processing_result (
        id, document_id, paperless_id, provider, model, suggested_title,
        suggested_correspondent, confidence_json, applied_status, created_at
      ) VALUES (?, ?, ?, 'openai', 'fixture', 'Suggested title', ?,
        '{"title":0.82,"correspondent":0.95}', ?, '2026-01-01T00:00:00.000Z')
    `);
    insert.run('a11y-pending', documentIds[0], 1, null, 'pending_review');
    insert.run('a11y-applied', documentIds[1], 2, 'long-value'.repeat(100), 'applied');
  } finally {
    db.close();
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test.afterEach(({ clearDB }) => {
      clearDB();
    });

    for (const [route, heading] of routes) {
      test(`${route} passes axe`, async ({ page, seedDB }) => {
        const { documentIds, groupIds } = seedDB();
        if (route.startsWith('/ai-processing')) seedAiResults(documentIds);

        const path = route.replace('[id]', groupIds[0]);
        const response = await page.goto(path);
        expect(response?.status()).toBe(route === missingPage ? 404 : 200);
        await expect(page).toHaveURL(route === '/ai-processing' ? '/ai-processing/review' : path);

        // Wait for the real theme control to respond so an SSR shell or error
        // page cannot stand in for the hydrated route.
        const themeRadio = page.getByRole('radio', { name: scheme, exact: false });
        await expect(async () => {
          await themeRadio.click();
          await expect(themeRadio).toBeChecked({ timeout: 500 });
        }).toPass({ timeout: 10_000 });
        await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();

        const checkAxe = async () => {
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations).toEqual([]);
        };
        await checkAxe();

        if (route === '/duplicates/wizard') {
          await page.getByRole('slider').fill('50');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Review Matching Groups' })).toBeVisible();
          await checkAxe();
        }

        if (route === '/settings') {
          await page.getByRole('tab', { name: 'AI Processing', exact: true }).click();
          await page.getByRole('button', { name: /^Show .*Prompt Template$/ }).click();
          await page.getByRole('checkbox', { name: 'Enable Tag Alias Mapping' }).check();
          await page.getByRole('button', { name: /^Show .*Tag Alias Map$/ }).click();
          await checkAxe();
        }

        if (route === '/ai-processing/history') {
          await expect(main.getByRole('table')).toBeVisible();
          await expect
            .poll(() => main.evaluate((element) => element.scrollWidth - element.clientWidth))
            .toBe(0);
        }
      });
    }
  });
}
