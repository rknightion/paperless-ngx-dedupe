import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html'], ['github'], ['junit', { outputFile: './test-results/junit.xml' }]]
    : [['html']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'pnpm --filter @paperless-dedupe/web preview --port 4173'
      : 'pnpm --filter @paperless-dedupe/core build && pnpm --filter @paperless-dedupe/web build && pnpm preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 60_000,
    env: {
      PAPERLESS_URL: 'http://localhost:18923',
      PAPERLESS_API_TOKEN: 'test-token-e2e',
      DATABASE_URL: './data/e2e-test.db',
      LOG_LEVEL: 'warn',
    },
  },
});
