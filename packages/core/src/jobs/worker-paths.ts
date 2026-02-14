import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const currentDir = dirname(fileURLToPath(import.meta.url));

export type WorkerName = 'sync-worker' | 'analysis-worker' | 'batch-worker';

export function getWorkerPath(name: WorkerName): string {
  const candidates = [
    // Relative to this file: works when core is used directly (tsc output, CLI, tests)
    join(currentDir, 'workers', `${name}.js`),
    // Production Docker: pre-compiled core dist copied into /app/core/
    // (SvelteKit bundles this module into chunks, breaking import.meta.url-relative paths)
    join(process.cwd(), 'core', 'jobs', 'workers', `${name}.js`),
    // Dev mode: .ts source (fails at runtime, handled by worker-launcher crash recovery)
    join(currentDir, 'workers', `${name}.ts`),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(`Worker script not found: ${name} (tried: ${candidates.join(', ')})`);
}
