import { test, expect } from '../fixtures/test-app';
import { seedDatabase } from '../fixtures/seed-data';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';

async function withReadOnlyApp(
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
  const directory = mkdtempSync(path.join(tmpdir(), 'app-read-only-'));
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

test('read-only API refuses upstream mutations without creating jobs', async ({ request }) => {
  await withReadOnlyApp({ PAPERLESS_READ_ONLY: 'true' }, async (url) => {
    const before = await (await request.get(`${url}/api/v1/jobs`)).json();
    for (const [method, route] of [
      ['POST', '/batch/delete-non-primary'],
      ['POST', '/ai/results/1/apply'],
      ['POST', '/ai/results/batch-apply'],
      ['POST', '/ai/results/apply-all'],
      ['POST', '/ai/results/1/revert'],
      ['POST', '/paperless/trash'],
      ['DELETE', '/paperless/documents/1'],
    ]) {
      const response = await request.fetch(`${url}/api/v1${route}`, { method, data: {} });
      expect.soft(response.status(), route).toBe(403);
      expect
        .soft((await response.json()).error)
        .toMatchObject({ code: 'READ_ONLY', retryable: false });
    }
    expect(await (await request.get(`${url}/api/v1/jobs`)).json()).toEqual(before);
    const config = await request.get(`${url}/api/v1/config`);
    expect(config.status()).toBe(200);
    expect.soft((await config.json()).meta.readOnly).toBe(true);
  });
});

test('read-only mode keeps local review, settings, backup, export and sync available', async ({
  request,
}) => {
  await withReadOnlyApp({ PAPERLESS_READ_ONLY: 'true' }, async (url, _output, dbPath) => {
    await request.get(`${url}/api/v1/health`);
    const seed = seedDatabase(dbPath);
    const status = await request.put(`${url}/api/v1/duplicates/${seed.groupIds[0]}/status`, {
      data: { status: 'ignored' },
    });
    expect(status.status()).toBe(200);
    expect((await status.json()).data.status).toBe('ignored');
    const settings = await request.put(`${url}/api/v1/config`, {
      data: { key: 'ai.model', value: 'gpt-5.4' },
    });
    expect(settings.status()).toBe(200);
    expect((await (await request.get(`${url}/api/v1/config`)).json()).data['ai.model']).toBe(
      'gpt-5.4',
    );
    const backup = await request.get(`${url}/api/v1/maintenance/backup`);
    expect(backup.status()).toBe(200);
    expect((await backup.body()).subarray(0, 15).toString()).toBe('SQLite format 3');
    const exported = await request.get(`${url}/api/v1/export/duplicates.csv`);
    expect(exported.status()).toBe(200);
    expect(await exported.text()).toContain('Test Document');
    const sync = await request.post(`${url}/api/v1/sync`);
    expect(sync.status()).toBe(202);
    expect((await sync.json()).data.jobId).toEqual(expect.any(String));
  });
});
