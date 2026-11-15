import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('../../../../web/', import.meta.url));

it.each([
  {
    name: 'Pyroscope alone',
    env: { PYROSCOPE_ENABLED: 'true', PYROSCOPE_SERVER_ADDRESS: 'http://127.0.0.1:9' },
    expected: 'object undefined',
  },
  { name: 'no telemetry', env: {}, expected: 'undefined undefined' },
  {
    name: 'Prometheus alone',
    env: { OTEL_PROMETHEUS_ENABLED: 'true' },
    expected: 'undefined object',
  },
])('starts the independent SDKs for $name', ({ env, expected }) => {
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `
    require('./telemetry.cjs');
    console.log(typeof globalThis.__pyroscopeModule, typeof globalThis.__otelSdk);
    process.exit(0);
  `,
    ],
    { cwd: webDir, env, timeout: 30_000, encoding: 'utf8' },
  );
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stdout.trim()).toBe(expected);
});
