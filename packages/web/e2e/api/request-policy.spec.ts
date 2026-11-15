import { test, expect } from '../fixtures/test-app';
import { seedDatabase } from '../fixtures/seed-data';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';

test('rejects an unapproved origin without changing state', async ({
  request,
  seedDB,
  clearDB,
}) => {
  const seed = seedDB();
  const groupId = seed.groupIds[0];
  try {
    const before = (await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data;
    const response = await request.post('/api/v1/batch/status', {
      headers: { Origin: 'https://foreign.example.test' },
      data: { groupIds: [groupId], status: 'ignored' },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toMatchObject({ retryable: false });
    expect((await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data).toEqual(
      before,
    );
  } finally {
    clearDB();
  }
});

test('honors an explicit allowed origin and the configured host', async ({ request }) => {
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
  const directory = mkdtempSync(path.join(tmpdir(), 'request-policy-'));
  const dbPath = path.join(directory, 'test.db');
  const allowedOrigin = 'https://allowed.example.test';
  const host = 'app.example.test';
  const child = spawn(process.execPath, ['build/index.js'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      ORIGIN: `http://${host}`,
      CORS_ALLOW_ORIGIN: allowedOrigin,
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
    const groupId = seedDatabase(dbPath).groupIds[0];
    const response = await request.post(`${url}/api/v1/batch/status`, {
      headers: { Host: host, Origin: allowedOrigin },
      data: { groupIds: [groupId], status: 'ignored' },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe(allowedOrigin);
    const read = await request.get(`${url}/api/v1/duplicates/${groupId}`, {
      headers: { Host: host },
    });
    const before = (await read.json()).data;
    expect(before.status).toBe('ignored');

    const wrongHost = await request.post(`${url}/api/v1/batch/status`, {
      headers: { Host: 'other.example.test', Origin: allowedOrigin },
      data: { groupIds: [groupId], status: 'false_positive' },
    });
    expect(wrongHost.status()).toBe(403);
    expect((await wrongHost.json()).error).toMatchObject({ retryable: false });
    expect(
      (
        await request.get(`${url}/api/v1/health`, { headers: { Host: 'other.example.test' } })
      ).status(),
    ).toBe(403);
    const crossSite = await request.post(`${url}/api/v1/batch/status`, {
      headers: { Host: host, Origin: allowedOrigin, 'Sec-Fetch-Site': 'cross-site' },
      data: { groupIds: [groupId], status: 'false_positive' },
    });
    expect(crossSite.status()).toBe(403);
    const after = await request.get(`${url}/api/v1/duplicates/${groupId}`, {
      headers: { Host: host },
    });
    expect((await after.json()).data).toEqual(before);
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

test('requires JSON content types for request bodies', async ({
  request,
  baseURL,
  seedDB,
  clearDB,
}) => {
  expect(baseURL).toBeDefined();
  const groupId = seedDB().groupIds[0];
  try {
    const before = (await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data;
    for (const contentType of ['application/xml', '']) {
      const response = await request.post('/api/v1/batch/status', {
        headers: { Origin: baseURL!, 'Content-Type': contentType },
        data: JSON.stringify({ groupIds: [groupId], status: 'ignored' }),
      });
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toMatchObject({ retryable: false });
      expect((await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data).toEqual(
        before,
      );
    }
  } finally {
    clearDB();
  }
});

test('accepts JSON automation and same-origin updates', async ({
  request,
  baseURL,
  seedDB,
  clearDB,
}) => {
  expect(baseURL).toBeDefined();
  const groupId = seedDB().groupIds[0];
  try {
    for (const origin of [undefined, baseURL]) {
      const status = origin ? 'false_positive' : 'ignored';
      const response = await request.post('/api/v1/batch/status', {
        headers: origin ? { Origin: origin } : {},
        data: { groupIds: [groupId], status },
      });
      expect(response.status()).toBe(200);
      expect((await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data.status).toBe(
        status,
      );
    }
  } finally {
    clearDB();
  }
});

test('rejects cross-site fetch metadata without changing state', async ({
  request,
  seedDB,
  clearDB,
}) => {
  const groupId = seedDB().groupIds[0];
  try {
    const before = (await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data;
    const response = await request.post('/api/v1/batch/status', {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      data: { groupIds: [groupId], status: 'ignored' },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toMatchObject({ retryable: false });
    expect((await (await request.get(`/api/v1/duplicates/${groupId}`)).json()).data).toEqual(
      before,
    );
  } finally {
    clearDB();
  }
});
