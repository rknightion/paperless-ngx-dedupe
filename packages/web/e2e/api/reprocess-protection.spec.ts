import { test, expect, DB_PATH } from '../fixtures/test-app';
import Database from 'better-sqlite3';

for (const status of ['applied', 'partial']) {
  test(`reprocess refuses ${status} results and preserves the snapshot`, async ({
    request,
    seedDB,
    clearDB,
  }) => {
    const seed = seedDB();
    const sqlite = new Database(DB_PATH);
    try {
      sqlite
        .prepare(
          `INSERT INTO ai_processing_result
        (id, document_id, paperless_id, provider, model, applied_status, pre_apply_title, applied_title, created_at)
        VALUES ('protected-result', ?, 1, 'openai', 'synthetic', ?, 'Original', 'AI title', ?)`,
        )
        .run(seed.documentIds[0], status, new Date().toISOString());
      const before = sqlite
        .prepare("SELECT * FROM ai_processing_result WHERE id = 'protected-result'")
        .get();
      const response = await request.post('/api/v1/ai/results/protected-result/reprocess');
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe('CONFLICT');
      expect(
        sqlite.prepare("SELECT * FROM ai_processing_result WHERE id = 'protected-result'").get(),
      ).toEqual(before);
    } finally {
      sqlite.close();
      clearDB();
    }
  });
}

for (const theme of ['Light', 'Dark']) {
  test(`history explains a reprocess conflict in ${theme}`, async ({ page, seedDB, clearDB }) => {
    const seed = seedDB();
    const sqlite = new Database(DB_PATH);
    try {
      sqlite
        .prepare("UPDATE document SET title = 'Protected synthetic result' WHERE id = ?")
        .run(seed.documentIds[0]);
      sqlite
        .prepare(
          `INSERT INTO ai_processing_result
        (id, document_id, paperless_id, provider, model, applied_status, error_message, created_at)
        VALUES ('protected-result', ?, 1, 'openai', 'synthetic', 'failed', 'Synthetic extraction failure', ?)`,
        )
        .run(seed.documentIds[0], new Date().toISOString());
      await page.goto('/ai-processing/history');
      await page.getByRole('radio', { name: theme, exact: true }).click();
      await page
        .locator('tr[role="button"]')
        .filter({ hasText: 'Protected synthetic result' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Retry Extraction', exact: true }),
      ).toBeVisible();
      // Another action applied the result after this drawer loaded.
      sqlite
        .prepare(
          "UPDATE ai_processing_result SET applied_status = 'applied', pre_apply_title = 'Original', applied_title = 'AI title' WHERE id = 'protected-result'",
        )
        .run();
      await page.getByRole('button', { name: 'Retry Extraction', exact: true }).click();
      const notice = page.getByText('Revert this result before reprocessing it', { exact: true });
      await expect(notice).toBeVisible();
      const contrast = await notice.evaluate(async (element) => {
        const ancestors: Element[] = [];
        for (let node: Element | null = element; node; node = node.parentElement)
          ancestors.push(node);
        await Promise.all(
          ancestors.flatMap((node) => node.getAnimations().map((animation) => animation.finished)),
        );
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 1, 1);
        for (const node of ancestors.reverse()) {
          const style = getComputedStyle(node);
          if (style.backgroundImage !== 'none')
            throw new Error('Contrast probe requires solid surfaces');
          context.fillStyle = style.backgroundColor;
          context.fillRect(0, 0, 1, 1);
        }
        const background = [...context.getImageData(0, 0, 1, 1).data];
        context.fillStyle = getComputedStyle(element).color;
        context.fillRect(0, 0, 1, 1);
        const foreground = [...context.getImageData(0, 0, 1, 1).data];
        const luminance = (color: number[]) =>
          color
            .slice(0, 3)
            .map((value) => {
              const c = value / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const a = luminance(background),
          b = luminance(foreground);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      console.log(`${theme} reprocess conflict contrast ${contrast.toFixed(2)}`);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    } finally {
      sqlite.close();
      clearDB();
    }
  });
}
