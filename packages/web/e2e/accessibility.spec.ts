import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/test-app';

const routes = [
  '/',
  '/documents',
  '/documents?library=true',
  '/duplicates',
  '/duplicates/[id]',
  '/duplicates/graph',
  '/duplicates/wizard',
  '/jobs',
  '/settings',
  '/ai-processing',
  '/ai-processing/queue',
  '/ai-processing/review',
  '/ai-processing/history',
  '/ai-processing/custom-fields',
  '/accessibility-test-missing',
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test.afterEach(({ clearDB }) => {
      clearDB();
    });

    for (const route of routes) {
      test(`${route} passes axe`, async ({ page, seedDB }) => {
        const { groupIds } = seedDB();
        const path = route.replace('[id]', groupIds[0]);

        const response = await page.goto(path);
        expect(response?.status()).toBe(route === '/accessibility-test-missing' ? 404 : 200);
        if (route === '/ai-processing') {
          await expect(page).toHaveURL('/ai-processing/review');
        }
        await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
        await expect(page.getByRole('main')).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

        if (route === '/duplicates/wizard') {
          await page.getByRole('slider').fill('50');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Review Matching Groups' })).toBeVisible();
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        }
      });
    }
  });
}
