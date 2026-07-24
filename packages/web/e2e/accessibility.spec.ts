import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/test-app';

test.describe('accessibility', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  for (const path of ['/', '/settings', '/documents', '/duplicates', '/ai-processing/review']) {
    test(`${path} has no serious or critical accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
    });
  }
});
