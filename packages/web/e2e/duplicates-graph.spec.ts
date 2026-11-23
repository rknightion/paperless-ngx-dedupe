import { test, expect } from './fixtures/test-app';

test.afterEach(({ clearDB }) => clearDB());

test('similarity graph follows the selected theme and the status filter', async ({
  page,
  seedDB,
}) => {
  seedDB();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/duplicates/graph');

  const graph = page.locator('main svg').filter({ has: page.locator('text') });
  await expect(graph.getByText('Test Document 1', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const firstSeriesIsPainted = () =>
    graph.evaluate((chart) => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--color-chart-1)';
      document.body.append(sample);
      const seriesColor = getComputedStyle(sample).color;
      sample.remove();
      return Array.from(chart.querySelectorAll('path, circle')).some(
        (mark) => getComputedStyle(mark).fill === seriesColor,
      );
    });

  await expect.poll(firstSeriesIsPainted).toBe(true);
  const darkTheme = page.getByRole('radio', { name: 'Dark', exact: true });
  await darkTheme.click();
  await expect(darkTheme).toBeChecked();
  await expect.poll(firstSeriesIsPainted).toBe(true);

  await page.getByLabel('Status', { exact: true }).selectOption('ignored');
  await expect(graph.getByText('Test Document 3', { exact: true })).toBeVisible();
  await expect(graph.getByText('Test Document 1', { exact: true })).toHaveCount(0);
});
