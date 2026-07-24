import { test, expect } from './fixtures/test-app';
import { DB_PATH } from './fixtures/test-app';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Page } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('page loads and shows title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Dashboard - Paperless NGX Dedupe');
    await expect(page.locator('main h1')).toHaveText('Dashboard');
  });

  test('shows a first-run checklist before the library has been synced', async ({ page }) => {
    await page.goto('/');

    const checklist = page.getByRole('region', { name: 'First-run checklist' });
    await expect(checklist).toBeVisible();
    await expect(checklist).toContainText('Connect to Paperless');
    await expect(checklist).toContainText('Sync your library');
    await expect(checklist).toContainText('Run duplicate analysis');
  });

  test('stat cards render with data', async ({ page }) => {
    await page.goto('/');

    // Stat cards should display
    await expect(page.getByText('Total Documents')).toBeVisible();
    await expect(page.getByText('Pending Groups')).toBeVisible();
    await expect(page.getByText('Pending Analysis')).toBeVisible();
    await expect(page.getByText('10 documents changed')).toBeVisible();
    await expect(page.getByText('3 groups found')).toBeVisible();
  });

  test('puts readiness before priority-ordered next actions with named safe controls', async ({
    page,
  }) => {
    makeDashboardActionable();

    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Readiness' })).toBeVisible();
    await expect(page.getByText(/Paperless connected/)).toBeVisible();

    await expect(page.locator('[data-testid="next-action"]')).toHaveCount(3);
    await expect(
      page
        .locator('[data-testid="next-action"]')
        .evaluateAll((actions) => actions.map((action) => action.getAttribute('data-action-id'))),
    ).resolves.toEqual(['retry-failed-jobs', 'run-analysis', 'review-duplicates']);

    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeVisible();
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Paperless NGX Dedupe' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Documents' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Duplicates' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('sidebar navigation links work', async ({ page }) => {
    await page.goto('/');

    // Navigate to Documents
    await page.locator('aside').getByRole('link', { name: 'Documents' }).click();
    await expect(page).toHaveURL(/\/documents/);

    // Navigate to Duplicates
    await page.locator('aside').getByRole('link', { name: 'Duplicates' }).click();
    await expect(page).toHaveURL(/\/duplicates/);

    // Navigate to Settings
    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);

    // Navigate back to Dashboard
    await page.locator('aside').getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
  });

  test('sync and analysis action buttons are visible', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeVisible();
  });

  test('shows global activity inline and disables only its matching safe action', async ({
    page,
  }) => {
    const jobId = nanoid();
    await mockActiveSync(page, jobId);

    await page.goto('/');

    const activity = page.getByRole('region', { name: 'Current activity' });
    await expect(activity).toContainText('Sync in progress');
    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
    await expect(
      page.getByText('A sync is already active. Follow its progress in Current activity.'),
    ).toBeVisible();
  });

  test('shows active analysis beside its disabled action without blocking sync', async ({
    page,
  }) => {
    const jobId = nanoid();
    await mockActiveJob(page, jobId, 'analysis', 'Analysis in progress');

    await page.goto('/');

    const activity = page.getByRole('region', { name: 'Current activity' });
    await expect(activity).toContainText('Analysis in progress');
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeEnabled();
    await expect(
      page.getByText(
        'Duplicate analysis is already active. Follow its progress in Current activity.',
      ),
    ).toBeVisible();
  });

  test('starts sync and analysis through safe requests and tracks their returned jobs', async ({
    page,
  }) => {
    const syncJobId = nanoid();
    const analysisJobId = nanoid();
    const requestBodies: Record<string, unknown> = {};
    await mockTrackedJobs(page, [
      { id: syncJobId, type: 'sync', message: 'Sync in progress' },
      { id: analysisJobId, type: 'analysis', message: 'Analysis in progress' },
    ]);
    await page.route('**/api/v1/sync', async (route) => {
      requestBodies.sync = route.request().postDataJSON();
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { jobId: syncJobId } }),
      });
    });
    await page.route('**/api/v1/analysis', async (route) => {
      requestBodies.analysis = route.request().postDataJSON();
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { jobId: analysisJobId } }),
      });
    });

    await page.goto('/');

    await page.getByRole('button', { name: 'Sync Now' }).click();
    await expect.poll(() => requestBodies.sync).toEqual({ force: false, purge: false });
    await expect(page.getByTestId(`activity-job-${syncJobId}`)).toBeVisible();

    await page.getByRole('button', { name: 'Run Analysis' }).click();
    await expect.poll(() => requestBodies.analysis).toEqual({ force: true });
    await expect(page.getByTestId(`activity-job-${analysisJobId}`)).toBeVisible();
  });

  test('keeps primary workflow actions visible without horizontal overflow on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const sync = page.getByRole('button', { name: 'Sync Now' });
    const analysis = page.getByRole('button', { name: 'Run Analysis' });
    await expect(sync).toBeVisible();
    await expect(analysis).toBeVisible();
    await sync.scrollIntoViewIfNeeded();
    await expect(sync).toBeInViewport();
    await analysis.scrollIntoViewIfNeeded();
    await expect(analysis).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('recent jobs section renders when jobs exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Recent Jobs')).toBeVisible();
  });
});

function makeDashboardActionable(): void {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();
  db.prepare('UPDATE sync_state SET last_analysis_at = NULL WHERE id = ?').run('singleton');
  db.prepare(
    `INSERT INTO job (id, type, status, progress, progress_message, started_at, completed_at, error_message, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(nanoid(), 'sync', 'failed', 0, 'Sync failed', now, now, 'Temporary failure', null, now);
  db.close();
}

async function mockActiveSync(page: Page, jobId: string): Promise<void> {
  return mockActiveJob(page, jobId, 'sync', 'Sync in progress');
}

async function mockActiveJob(
  page: Page,
  jobId: string,
  type: 'sync' | 'analysis',
  message: string,
): Promise<void> {
  await page.route('**/api/v1/jobs**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/jobs') return route.continue();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: jobId,
            type,
            status: 'running',
            progress: 0.25,
            progressMessage: message,
          },
        ],
      }),
    });
  });
  await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: jobId,
          type,
          status: 'running',
          progress: 0.25,
          progressMessage: message,
        },
      }),
    });
  });
  await page.route(`**/api/v1/jobs/${jobId}/progress`, async (route) => {
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: progress\ndata: {"progress":0.25,"status":"running"}\n\n',
    });
  });
}

async function mockTrackedJobs(
  page: Page,
  jobs: { id: string; type: 'sync' | 'analysis'; message: string }[],
): Promise<void> {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  await page.route('**/api/v1/jobs**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/jobs') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }

    const [, jobId, endpoint] = url.pathname.match(/\/api\/v1\/jobs\/([^/]+)(?:\/(.*))?/) ?? [];
    const job = jobId ? jobsById.get(jobId) : undefined;
    if (!job) {
      await route.continue();
      return;
    }
    if (endpoint === 'progress') {
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'event: progress\ndata: {"progress":0.25,"status":"running"}\n\n',
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: job.id,
          type: job.type,
          status: 'running',
          progress: 0.25,
          progressMessage: job.message,
        },
      }),
    });
  });
}
