import { test, expect } from '../fixtures/test-app';
import { DB_PATH } from '../fixtures/test-app';
import type { SeedResult } from '../fixtures/seed-data';
import Database from 'better-sqlite3';

test.describe('AI API', () => {
  let seed: SeedResult;

  test.beforeEach(async ({ seedDB }) => {
    seed = seedDB();
    await fetch('http://localhost:18923/__control__/reset', { method: 'POST' });
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('invalid process scopes and JSON create no job', async ({ request }) => {
    const sqlite = new Database(DB_PATH);
    try {
      const before = sqlite.prepare('SELECT * FROM job').all();
      for (const data of [
        { scope: { type: 'unknown' } },
        { scope: { type: 'selected_result_ids', resultIds: ['result-1'] } },
        { scope: { type: 'selected_document_ids', documentIds: [] } },
        { scope: { type: 'selected_document_ids', documentIds: [''] } },
        { scope: { type: 'current_filter', filters: [] } },
        '{invalid json',
      ]) {
        const response = await request.post('/api/v1/ai/process', {
          headers: { 'Content-Type': 'application/json' },
          data,
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
        expect(sqlite.prepare('SELECT * FROM job').all()).toEqual(before);
      }
    } finally {
      sqlite.close();
    }
  });

  test('empty process scopes create no job', async ({ request }) => {
    const sqlite = new Database(DB_PATH);
    try {
      const before = sqlite.prepare('SELECT * FROM job').all();
      for (const data of [
        { scope: { type: 'failed_only' } },
        { scope: { type: 'current_filter', filters: { search: 'no-synthetic-match' } } },
        { documentIds: [] },
      ]) {
        const response = await request.post('/api/v1/ai/process', { data });
        expect(response.status()).toBe(200);
        expect((await response.json()).data).toEqual({ jobId: null, nothingToDo: true });
        expect(sqlite.prepare('SELECT * FROM job').all()).toEqual(before);
      }
    } finally {
      sqlite.close();
    }
  });

  test('queue Retry selects the row document and handles nothing to process', async ({ page }) => {
    const sqlite = new Database(DB_PATH);
    try {
      sqlite
        .prepare(
          `INSERT INTO ai_processing_result
        (id, document_id, paperless_id, provider, model, applied_status, created_at)
        VALUES ('retry-result', ?, 1, 'openai', 'e2e-model', 'failed', ?)`,
        )
        .run(seed.documentIds[0], new Date().toISOString());
    } finally {
      sqlite.close();
    }
    let posted: unknown;
    await page.route('**/api/v1/ai/process', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { data: { jobId: null, nothingToDo: true } } });
    });
    await page.goto('/ai-processing/queue');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect
      .poll(() => posted)
      .toEqual({
        scope: { type: 'selected_document_ids', documentIds: [seed.documentIds[0]] },
      });
    await expect(page.getByText('Nothing to process', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('radio', { name: theme, exact: true }).click();
      for (const locator of [
        page.getByRole('button', { name: 'Retry', exact: true }),
        page.getByText('Nothing to process', { exact: true }),
      ]) {
        const contrast = await locator.evaluate(async (element) => {
          const ancestors: Element[] = [];
          for (let node: Element | null = element; node; node = node.parentElement)
            ancestors.push(node);
          await Promise.all(
            ancestors.flatMap((node) =>
              node.getAnimations().map((animation) => animation.finished),
            ),
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
                const channel = value / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const a = luminance(foreground);
          const b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        console.log(`${theme} ${await locator.textContent()}: contrast ${contrast.toFixed(2)}`);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // ── Stats (no AI_ENABLED check) ─────────────────────────────────────

  test('GET /api/v1/ai/stats returns stats', async ({ request }) => {
    const response = await request.get('/api/v1/ai/stats');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.totalProcessed).toBe('number');
    expect(typeof body.data.pendingReview).toBe('number');
    expect(typeof body.data.applied).toBe('number');
    expect(typeof body.data.rejected).toBe('number');
    expect(typeof body.data.failed).toBe('number');
    expect(typeof body.data.totalPromptTokens).toBe('number');
    expect(typeof body.data.totalCompletionTokens).toBe('number');
  });

  // ── Models (no AI_ENABLED check) ────────────────────────────────────

  test('GET /api/v1/ai/models returns model list for openai', async ({ request }) => {
    const response = await request.get('/api/v1/ai/models');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  // ── Results (no AI_ENABLED check) ───────────────────────────────────

  test('GET /api/v1/ai/results returns paginated results', async ({ request }) => {
    const response = await request.get('/api/v1/ai/results');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.limit).toBe('number');
    expect(typeof body.meta.offset).toBe('number');
  });

  test('GET /api/v1/ai/results/:id returns 404 for non-existent ID', async ({ request }) => {
    const response = await request.get('/api/v1/ai/results/nonexistent-id');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ── Config ──────────────────────────────────────────────────────────

  test('GET /api/v1/ai/config returns config when AI is enabled', async ({ request }) => {
    const response = await request.get('/api/v1/ai/config');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.provider).toBe('openai');
  });

  test('PUT /api/v1/ai/config updates config when AI is enabled', async ({ request }) => {
    const response = await request.put('/api/v1/ai/config', {
      headers: { 'Content-Type': 'application/json' },
      data: { applyConcurrency: 3 },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.applyConcurrency).toBe(3);
  });

  // ── Batch operations ────────────────────────────────────────────────

  test('POST /api/v1/ai/results/batch-reject returns 400 with empty resultIds', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/ai/results/batch-reject', {
      headers: { 'Content-Type': 'application/json' },
      data: { resultIds: [] },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/v1/ai/results/batch-apply requires a reviewed plan token', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/ai/results/batch-apply', {
      headers: { 'Content-Type': 'application/json' },
      data: { resultIds: ['r-1'] },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('creates a reviewed apply plan and executes it through the production worker', async ({
    request,
  }) => {
    const resultId = 'e2e-reviewed-ai-result';
    const sqlite = new Database(DB_PATH);
    sqlite
      .prepare(
        `INSERT INTO ai_processing_result (
           id, document_id, paperless_id, provider, model, suggested_title,
           current_title, applied_status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        resultId,
        seed.documentIds[0],
        1,
        'openai',
        'e2e-model',
        'AI reviewed E2E title',
        'Test Document 1',
        'pending_review',
        new Date().toISOString(),
      );
    sqlite.close();

    const preflightResponse = await request.post('/api/v1/ai/results/preflight', {
      data: {
        scope: { type: 'selected_result_ids', resultIds: [resultId] },
        selection: {
          title: true,
          correspondent: false,
          documentType: false,
          tags: false,
          processedTag: false,
          customFieldIds: [],
        },
      },
    });
    expect(preflightResponse.status()).toBe(200);
    const preflight = await preflightResponse.json();
    expect(preflight.data.resultIds).toEqual([resultId]);

    const applyResponse = await request.post('/api/v1/ai/results/batch-apply', {
      data: { planToken: preflight.data.token },
    });
    expect(applyResponse.status()).toBe(202);
    const apply = await applyResponse.json();

    await expect
      .poll(async () => {
        const jobs = await request.get('/api/v1/jobs?limit=200');
        const jobsBody = await jobs.json();
        return jobsBody.data.find((job: { id: string }) => job.id === apply.data.jobId)?.status;
      })
      .toBe('completed');

    const paperlessResponse = await fetch('http://localhost:18923/api/documents/1/', {
      headers: { Authorization: 'Token test-token-e2e' },
    });
    expect(paperlessResponse.status).toBe(200);
    const paperlessDocument = (await paperlessResponse.json()) as { title: string };
    expect(paperlessDocument.title).toBe('AI reviewed E2E title');

    const resultResponse = await request.get(`/api/v1/ai/results/${resultId}`);
    expect(resultResponse.status()).toBe(200);
    const result = await resultResponse.json();
    expect(result.data.appliedStatus).toBe('partial');
  });

  test('reject guards preserve applied results and report only changed rows', async ({
    request,
  }) => {
    const sqlite = new Database(DB_PATH);
    try {
      const insert = sqlite.prepare(`INSERT INTO ai_processing_result
        (id, document_id, paperless_id, provider, model, applied_status, created_at)
        VALUES (?, ?, ?, 'openai', 'e2e-model', ?, ?)`);
      for (const [index, status] of ['applied', 'pending_review', 'failed'].entries()) {
        insert.run(
          `guard-${status}`,
          seed.documentIds[index],
          index + 1,
          status,
          new Date().toISOString(),
        );
      }
      const before = sqlite
        .prepare('SELECT * FROM ai_processing_result WHERE id = ?')
        .get('guard-applied');
      const applied = await request.post('/api/v1/ai/results/guard-applied/reject');
      expect(applied.status()).toBe(409);
      expect((await applied.json()).error.code).toBe('CONFLICT');
      const pending = await request.post('/api/v1/ai/results/guard-pending_review/reject');
      expect(pending.status()).toBe(200);
      const batch = await request.post('/api/v1/ai/results/batch-reject', {
        data: {
          resultIds: ['guard-applied', 'guard-pending_review', 'guard-failed', 'guard-failed'],
        },
      });
      expect(batch.status()).toBe(200);
      expect((await batch.json()).data.rejected).toBe(1);
      expect(
        sqlite.prepare('SELECT * FROM ai_processing_result WHERE id = ?').get('guard-applied'),
      ).toEqual(before);
    } finally {
      sqlite.close();
    }
  });

  test('a reprocess error before extraction preserves the result row', async ({ request }) => {
    const sqlite = new Database(DB_PATH);
    try {
      sqlite
        .prepare(
          `INSERT INTO ai_processing_result
        (id, document_id, paperless_id, provider, model, applied_status, failure_type, created_at)
        VALUES ('guard-reprocess', ?, 1, 'openai', 'e2e-model', 'applied', 'timeout', ?)`,
        )
        .run(seed.documentIds[0], new Date().toISOString());
      sqlite.prepare('DELETE FROM document_content WHERE document_id = ?').run(seed.documentIds[0]);
      const before = sqlite
        .prepare('SELECT * FROM ai_processing_result WHERE id = ?')
        .get('guard-reprocess');
      const response = await request.post('/api/v1/ai/results/guard-reprocess/reprocess');
      expect(response.status()).toBe(500);
      expect(
        sqlite.prepare('SELECT * FROM ai_processing_result WHERE id = ?').get('guard-reprocess'),
      ).toEqual(before);
    } finally {
      sqlite.close();
    }
  });

  // ── Single result reject (no AI_ENABLED check) ──────────────────────

  test('POST /api/v1/ai/results/:id/reject returns success even for non-existent', async ({
    request,
  }) => {
    // The reject endpoint doesn't check AI_ENABLED and doesn't validate existence
    const response = await request.post('/api/v1/ai/results/nonexistent-id/reject');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.rejected).toBe(true);
  });
});
