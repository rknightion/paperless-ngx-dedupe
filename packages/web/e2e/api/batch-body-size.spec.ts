import { test, expect } from '../fixtures/test-app';
import { seedDatabase } from '../fixtures/seed-data';
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';

function groupIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `missing${String(i).padStart(14, '0')}`);
}

test('delivers the accepted batch boundary through the default Node body limit', async ({
  request,
}) => {
  const port = await new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      listener.close((error) => {
        if (error) reject(error);
        else if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Test listener did not receive a TCP port'));
      });
    });
  });
  const directory = mkdtempSync(path.join(tmpdir(), 'batch-body-size-'));
  const dbPath = path.join(directory, 'test.db');
  const host = 'app.example.test';
  const environment = { ...process.env };
  delete environment.BODY_SIZE_LIMIT;
  const child = spawn(process.execPath, ['build/index.js'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...environment,
      HOST: '127.0.0.1',
      PORT: String(port),
      ORIGIN: `http://${host}`,
      DATABASE_URL: dbPath,
      PAPERLESS_URL: 'http://localhost:18923',
      PAPERLESS_API_TOKEN: 'test-token-e2e',
      AI_ENABLED: 'false',
      OTEL_ENABLED: 'false',
      OTEL_PROMETHEUS_ENABLED: 'false',
      PYROSCOPE_ENABLED: 'false',
      LOG_LEVEL: 'error',
      SHUTDOWN_TIMEOUT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let startupError: Error | undefined;
  child.on('error', (error) => {
    startupError = error;
  });
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  try {
    await expect
      .poll(
        () => {
          if (startupError) throw startupError;
          if (child.exitCode !== null) throw new Error(`Test server exited: ${output}`);
          return output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
        },
        { timeout: 10_000 },
      )
      .toBeTruthy();
    const url = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)![1];
    const health = await request.get(`${url}/api/v1/health`, { headers: { Host: host } });
    expect(health.status(), output).toBe(200);
    const oversized = await request.post(`${url}/api/v1/batch/status`, {
      headers: { Host: host },
      data: { groupIds: groupIds(25_000), status: 'ignored' },
    });
    console.log(`Node default, 25000 ids: ${oversized.status()} ${await oversized.text()}`);
    expect(oversized.status()).toBe(400);
    const seed = seedDatabase(dbPath);
    const previewIds = groupIds(25_000).map((id) => id.replace('missing', 'preview'));
    const database = new Database(dbPath);
    try {
      const insertGroup = database.prepare(
        "INSERT INTO duplicate_group (id, status, confidence_score, algorithm_version, created_at, updated_at) VALUES (?, 'pending', 0.99, 'synthetic', ?, ?)",
      );
      const insertMember = database.prepare(
        'INSERT INTO duplicate_member (id, group_id, document_id, is_primary) VALUES (?, ?, ?, ?)',
      );
      const now = new Date().toISOString();
      database.transaction(() => {
        for (const id of previewIds) {
          insertGroup.run(id, now, now);
          insertMember.run(`${id}-primary`, id, seed.documentIds[0], 1);
          insertMember.run(`${id}-other`, id, seed.documentIds[1], 0);
        }
      })();
    } finally {
      database.close();
    }
    const preview = await request.post(`${url}/api/v1/batch/delete-non-primary/preview`, {
      headers: { Host: host },
      data: { groupIds: previewIds },
    });
    console.log(`Node default, 25000 preview ids: ${preview.status()}`);
    expect(preview.status()).toBe(400);
    const chunkPreview = await request.post(`${url}/api/v1/batch/delete-non-primary/preview`, {
      headers: { Host: host },
      data: { groupIds: previewIds.slice(0, 10_000) },
    });
    expect(chunkPreview.status()).toBe(200);
    expect((await chunkPreview.json()).data.groupCount).toBe(10_000);
    for (const count of [20_000, 20_001]) {
      const response = await request.post(`${url}/api/v1/batch/status`, {
        headers: { Host: host },
        data: { groupIds: groupIds(count), status: 'ignored' },
      });
      const body = await response.json();
      if (count === 20_000) {
        expect(response.status()).toBe(200);
        expect(body.data).toMatchObject({ updated: 0 });
      } else {
        expect(response.status()).toBe(400);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      }
    }
  } finally {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const failSecondChunk of [false, true]) {
  test(`wizard chunks status updates and preserves progress: failure=${failSecondChunk}`, async ({
    page,
    seedDB,
    clearDB,
  }) => {
    seedDB();
    const ids = groupIds(25_001);
    const chunks: string[][] = [];
    try {
      await page.route('**/api/v1/duplicates?*', async (route) => {
        const url = new URL(route.request().url());
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 10);
        await route.fulfill({
          json: {
            data: ids.slice(offset, offset + limit).map((id) => ({
              id,
              primaryDocumentTitle: 'Synthetic duplicate',
              primaryPaperlessId: 1,
              confidenceScore: 0.99,
              memberCount: 2,
            })),
            meta: { total: ids.length, totalMemberCount: ids.length * 2 },
          },
        });
      });
      await page.route('**/api/v1/batch/status', async (route) => {
        const body = route.request().postDataJSON();
        chunks.push(body.groupIds);
        await route.fulfill(
          failSecondChunk && chunks.length === 2
            ? { status: 500, json: { error: { code: 'INTERNAL_ERROR' } } }
            : { json: { data: { updated: body.groupIds.length } } },
        );
      });
      await page.goto('/duplicates/wizard');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).last().click();
      await page.getByRole('button', { name: /Ignore All/ }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByLabel(/I understand this action affects/).check();
      await page.getByRole('button', { name: 'Execute', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: failSecondChunk ? 'Operation Failed' : 'Operation Complete',
        }),
      ).toBeVisible({ timeout: 25_000 });
      expect(chunks.map((chunk) => chunk.length)).toEqual(
        failSecondChunk ? [10_000, 10_000] : [10_000, 10_000, 5_001],
      );
      expect(chunks.flat()).toEqual(ids.slice(0, failSecondChunk ? 20_000 : ids.length));
      await expect(
        page.getByText(
          failSecondChunk
            ? /10000 groups processed before the request failed/
            : /25001 groups processed successfully/,
        ),
      ).toBeVisible();
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator('html')).toHaveClass(
          colorScheme === 'dark' ? /dark/ : /^(?!.*dark).*$/,
        );
        const ratio = await page
          .getByText(
            failSecondChunk
              ? /10000 groups processed before the request failed/
              : /25001 groups processed successfully/,
          )
          .evaluate((element) => {
            const foreground = getComputedStyle(element).color;
            let surface: Element | null = element;
            let background = 'rgba(0, 0, 0, 0)';
            while (surface && background === 'rgba(0, 0, 0, 0)') {
              background = getComputedStyle(surface).backgroundColor;
              surface = surface.parentElement;
            }
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext('2d')!;
            const luminance = (color: string) => {
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((byte) => {
                  const value = byte / 255;
                  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
            return (values[1] + 0.05) / (values[0] + 0.05);
          });
        console.log(`Wizard result contrast, ${colorScheme}, failure=${failSecondChunk}: ${ratio}`);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    } finally {
      clearDB();
    }
  });
}
