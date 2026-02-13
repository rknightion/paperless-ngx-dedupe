import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const currentDir = dirname(fileURLToPath(import.meta.url));

export type WorkerName = 'sync-worker' | 'analysis-worker' | 'batch-worker';

export function getWorkerPath(name: WorkerName): string {
  // Try .ts first (dev mode with tsx)
  const tsPath = join(currentDir, 'workers', `${name}.ts`);
  if (existsSync(tsPath)) {
    return tsPath;
  }

  // Fall back to .js (production build)
  const jsPath = join(currentDir, 'workers', `${name}.js`);
  if (existsSync(jsPath)) {
    return jsPath;
  }

  throw new Error(`Worker script not found: ${name} (tried ${tsPath} and ${jsPath})`);
}
