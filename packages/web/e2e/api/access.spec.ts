import { test, expect } from '../fixtures/test-app';
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';

async function withProtectedApp(
  variables: Record<string, string | undefined>,
  check: (url: string, output: () => string, dbPath: string) => Promise<void>,
) {
  const port = await new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      listener.close((error) => {
        if (error) reject(error);
        else if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Missing test port'));
      });
    });
  });
  const directory = mkdtempSync(path.join(tmpdir(), 'app-access-'));
  const child = spawn(process.execPath, ['build/index.js'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      ORIGIN: `http://127.0.0.1:${port}`,
      DATABASE_URL: path.join(directory, 'test.db'),
      PAPERLESS_URL: 'http://localhost:18923',
      PAPERLESS_API_TOKEN: 'test-token-e2e',
      AI_ENABLED: 'false',
      OTEL_ENABLED: 'false',
      OTEL_PROMETHEUS_ENABLED: 'false',
      PYROSCOPE_ENABLED: 'false',
      LOG_LEVEL: 'info',
      APP_AUTH_MODE: undefined,
      APP_AUTH_USERNAME: undefined,
      APP_AUTH_PASSWORD: undefined,
      APP_API_TOKEN: undefined,
      APP_AUTH_PROXY_HEADER: undefined,
      APP_AUTH_TRUSTED_PROXIES: undefined,
      ADDRESS_HEADER: undefined,
      SHUTDOWN_TIMEOUT: '1',
      ...variables,
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
          return output.includes('Listening on');
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await check(`http://127.0.0.1:${port}`, () => output, path.join(directory, 'test.db'));
  } finally {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

const basicEnvironment = {
  APP_AUTH_MODE: 'basic',
  APP_AUTH_USERNAME: 'operator',
  APP_AUTH_PASSWORD: 'synthetic-access-password',
  APP_API_TOKEN: 'synthetic-access-token',
};

test('rejects an unauthenticated API request when APP_AUTH_MODE is basic', async ({ request }) => {
  await withProtectedApp(basicEnvironment, async (url) => {
    const response = await request.get(`${url}/api/v1/config`);
    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toContain('Basic');
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });
});

test('serves configured credentials and public probes while protecting pages and metrics', async ({
  request,
}) => {
  await withProtectedApp(basicEnvironment, async (url, output) => {
    const wrong = await request.get(`${url}/api/v1/config`, {
      headers: { Authorization: 'Bearer incorrect' },
    });
    expect(wrong.status()).toBe(401);
    for (const authorization of [
      `Basic ${Buffer.from('operator:synthetic-access-password').toString('base64')}`,
      'Bearer synthetic-access-token',
    ]) {
      const response = await request.get(`${url}/api/v1/config`, {
        headers: { Authorization: authorization },
      });
      expect(response.status()).toBe(200);
      expect((await response.json()).data).toBeDefined();
    }
    for (const route of ['/api/v1/health', '/api/v1/ready']) {
      expect((await request.get(`${url}${route}`)).status()).toBe(200);
    }
    expect((await request.fetch(`${url}/api/v1/config`, { method: 'OPTIONS' })).status()).toBe(204);
    expect((await request.get(`${url}/api/v1/metrics`)).status()).toBe(401);
    expect((await request.get(url)).status()).toBe(401);
    expect(
      (
        await request.get(url, {
          headers: {
            Authorization: `Basic ${Buffer.from('operator:synthetic-access-password').toString('base64')}`,
          },
        })
      ).status(),
    ).toBe(200);
    expect(output()).not.toContain('synthetic-access-password');
    expect(output()).not.toContain('synthetic-access-token');
  });
});

test('keeps the default mode open and logs one startup notice', async ({ request }) => {
  await withProtectedApp({}, async (url, output) => {
    for (let index = 0; index < 2; index++) {
      expect((await request.get(`${url}/api/v1/config`)).status()).toBe(200);
    }
    expect(output().match(/Application access protection is disabled/g)).toHaveLength(1);
  });
});

test('accepts identity only from a trusted proxy while preserving API tokens and public probes', async ({
  request,
}) => {
  await withProtectedApp(
    {
      APP_AUTH_MODE: 'proxy',
      APP_AUTH_TRUSTED_PROXIES: '127.0.0.1/32',
      APP_AUTH_PROXY_HEADER: 'X-Authenticated-User',
      APP_API_TOKEN: 'synthetic-access-token',
    },
    async (url) => {
      const identity = { 'X-Authenticated-User': 'synthetic-user' };
      expect((await request.get(url, { headers: identity })).status()).toBe(200);
      expect((await request.get(`${url}/api/v1/config`, { headers: identity })).status()).toBe(200);
      expect((await request.get(url)).status()).toBe(401);
      expect((await request.get(`${url}/api/v1/metrics`)).status()).toBe(401);
      expect(
        (
          await request.get(`${url}/api/v1/config`, {
            headers: { Authorization: 'Bearer synthetic-access-token' },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await request.get(`${url}/api/v1/config`, {
            headers: { ...identity, Authorization: 'Bearer incorrect' },
          })
        ).status(),
      ).toBe(401);
      for (const route of ['/api/v1/health', '/api/v1/ready']) {
        expect((await request.get(`${url}${route}`)).status()).toBe(200);
      }
      expect((await request.fetch(`${url}/api/v1/config`, { method: 'OPTIONS' })).status()).toBe(
        204,
      );
    },
  );
});

test('does not trust a forwarded peer address to accept a proxy identity', async ({ request }) => {
  await withProtectedApp(
    {
      APP_AUTH_MODE: 'proxy',
      APP_AUTH_TRUSTED_PROXIES: '192.0.2.0/24',
      APP_API_TOKEN: 'synthetic-access-token',
      ADDRESS_HEADER: 'x-forwarded-for',
    },
    async (url) => {
      const headers = { 'Remote-User': 'synthetic-user', 'X-Forwarded-For': '192.0.2.1' };
      expect((await request.get(`${url}/api/v1/config`, { headers })).status()).toBe(401);
      expect((await request.get(url, { headers })).status()).toBe(401);
      expect(
        (
          await request.get(`${url}/api/v1/config`, {
            headers: { ...headers, Authorization: 'Bearer synthetic-access-token' },
          })
        ).status(),
      ).toBe(200);
    },
  );
});

test('shows the Settings access notice only when protection is disabled', async ({ browser }) => {
  for (const mode of ['none', 'basic', 'proxy']) {
    await withProtectedApp(
      { ...basicEnvironment, APP_AUTH_MODE: mode, APP_AUTH_TRUSTED_PROXIES: '127.0.0.1/32' },
      async (url) => {
        const context = await browser.newContext({
          httpCredentials: { username: 'operator', password: 'synthetic-access-password' },
          extraHTTPHeaders: { 'Remote-User': 'synthetic-user' },
        });
        try {
          const page = await context.newPage();
          await page.goto(`${url}/settings`);
          await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
          const notice = page.getByRole('note', { name: 'Access protection', exact: true });
          if (mode === 'none') await expect(notice).toBeVisible();
          else await expect(notice).toHaveCount(0);
        } finally {
          await context.close();
        }
      },
    );
  }
});

test('webhook sync stays disabled by default and accepts authenticated bursts without reading payloads', async ({
  request,
}) => {
  await withProtectedApp(
    { APP_API_TOKEN: 'synthetic-webhook-token' },
    async (url, _output, dbPath) => {
      await request.get(`${url}/api/v1/health`);
      const db = new Database(dbPath);
      const headers = {
        Authorization: 'Bearer synthetic-webhook-token',
        'Content-Type': 'application/json',
      };
      const endpoint = `${url}/api/v1/hooks/paperless`;
      try {
        const before = db.prepare('SELECT * FROM app_config ORDER BY key').all();
        const disabled = await request.post(endpoint, { headers, data: { ignored: true } });
        expect.soft(disabled.status()).toBe(404);
        expect.soft((await disabled.json()).error.code).toBe('NOT_FOUND');
        expect(db.prepare('SELECT * FROM app_config ORDER BY key').all()).toEqual(before);
        const configured = await request.put(`${url}/api/v1/config`, {
          data: {
            settings: {
              'automation.webhookSyncEnabled': true,
              'automation.webhookQuietSeconds': 60,
            },
          },
        });
        expect(configured.status()).toBe(200);
        for (const authorization of [
          undefined,
          'Bearer incorrect',
          `Basic ${Buffer.from('operator:synthetic-password').toString('base64')}`,
        ]) {
          const response = await request.post(endpoint, {
            headers: authorization ? { Authorization: authorization } : {},
            data: {},
          });
          expect.soft(response.status()).toBe(401);
        }
        expect(
          db.prepare("SELECT * FROM app_config WHERE key='hooks.syncRequestedAt'").get(),
        ).toBeUndefined();
        const initialJobs = db.prepare('SELECT id FROM job ORDER BY id').all();
        for (let i = 0; i < 30; i++) {
          const response = await request.post(endpoint, {
            headers,
            data: i % 2 ? 'ignored malformed JSON' : { arbitrary: i },
          });
          expect(response.status()).toBe(202);
          const value = db
            .prepare("SELECT value FROM app_config WHERE key='hooks.syncRequestedAt'")
            .get() as { value: string };
          expect((await response.json()).data).toEqual({
            accepted: true,
            syncNotBefore: new Date(Date.parse(value.value) + 60000).toISOString(),
          });
        }
        expect(db.prepare('SELECT id FROM job ORDER BY id').all()).toEqual(initialJobs);
      } finally {
        db.close();
      }
    },
  );
});

test('enabled webhook requires an API token even with access mode none', async ({ request }) => {
  await withProtectedApp({}, async (url, _output, dbPath) => {
    await request.get(`${url}/api/v1/health`);
    expect(
      (
        await request.put(`${url}/api/v1/config`, {
          data: { key: 'automation.webhookSyncEnabled', value: true },
        })
      ).status(),
    ).toBe(200);
    const db = new Database(dbPath);
    try {
      for (const authorization of [undefined, 'Bearer synthetic-unconfigured-token']) {
        const response = await request.post(`${url}/api/v1/hooks/paperless`, {
          data: {},
          headers: authorization ? { Authorization: authorization } : {},
        });
        expect(response.status()).toBe(401);
        expect((await response.json()).error.code).toBe('UNAUTHORIZED');
      }
      expect(
        db.prepare("SELECT * FROM app_config WHERE key='hooks.syncRequestedAt'").get(),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
