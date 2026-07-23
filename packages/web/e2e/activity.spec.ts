import { test, expect } from './fixtures/test-app';
import type { Page } from '@playwright/test';
import { nanoid } from 'nanoid';

test.describe('Global activity', () => {
  test.beforeEach(async ({ seedDB }) => {
    seedDB();
  });

  test.afterEach(async ({ clearDB }) => {
    clearDB();
  });

  test('keeps a started sync visible after navigating to Documents', async ({ page }) => {
    const jobId = nanoid();
    let syncStarted = false;
    await mockActivityJob(page, jobId, () => syncStarted);
    await page.route('**/api/v1/sync', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      syncStarted = true;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { jobId } }),
      });
    });
    await page.goto('/');

    await page.getByRole('button', { name: 'Sync Now' }).click();

    await page.locator('aside').getByRole('link', { name: 'Documents' }).click();

    await expect(page.getByTestId(`activity-job-${jobId}`)).toBeVisible();
  });

  test('checks REST state after one dropped activity connection before showing failure', async ({
    page,
  }) => {
    const jobId = nanoid();
    let droppedConnection = false;
    let jobReads = 0;
    let releaseTerminalRead: (() => void) | undefined;
    const terminalRead = new Promise<void>((resolve) => {
      releaseTerminalRead = resolve;
    });

    await mockActivityJob(page, jobId);
    await page.route(`**/api/v1/jobs/${jobId}/progress`, async (route) => {
      if (!droppedConnection) {
        droppedConnection = true;
        await route.abort('failed');
        return;
      }
      await route.abort('failed');
    });
    await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
      jobReads += 1;
      const completed = jobReads > 1;
      if (completed) await terminalRead;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: jobId,
            type: 'sync',
            status: completed ? 'completed' : 'running',
            progress: completed ? 1 : 0.25,
            progressMessage: completed ? 'Sync complete' : 'Synchronising documents',
          },
        }),
      });
    });

    await page.goto('/documents');

    const activity = page.getByTestId(`activity-job-${jobId}`);
    await expect.poll(() => droppedConnection).toBe(true);
    await expect(activity).toHaveAttribute('data-job-state', 'running');
    await expect(activity).not.toContainText('Failed');
    releaseTerminalRead?.();
    await expect(activity).toHaveAttribute('data-job-state', 'completed');
    await expect(activity).not.toContainText('Failed');
    expect(droppedConnection).toBe(true);
  });

  test('does not rediscover an active job dismissed during this browser session', async ({
    page,
  }) => {
    const jobId = nanoid();
    await mockActivityJob(page, jobId);

    await page.goto('/documents');

    const activity = page.getByTestId(`activity-job-${jobId}`);
    await expect(activity).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss sync activity' }).click();
    await expect(activity).toBeHidden();

    await page.waitForTimeout(2_250);
    await expect(activity).toBeHidden();
  });
});

async function mockActivityJob(page: Page, jobId: string, include = () => true) {
  await page.route('**/api/v1/jobs**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/jobs') return route.continue();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: include()
          ? [
              {
                id: jobId,
                type: 'sync',
                status: 'running',
                progress: 0.25,
                progressMessage: 'Synchronising documents',
              },
            ]
          : [],
      }),
    });
  });
  await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: jobId,
          type: 'sync',
          status: 'running',
          progress: 0.25,
          progressMessage: 'Synchronising documents',
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
