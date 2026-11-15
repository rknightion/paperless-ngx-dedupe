import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const routeRoot = join(repositoryRoot, 'packages/web/src/routes/api/v1');

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === '+server.ts' ? [path] : [];
  });
}

it('documents every exported API method with its exact route heading', () => {
  const headings = new Set(
    readFileSync(join(repositoryRoot, 'docs/api-reference.md'), 'utf8').split('\n'),
  );
  const missing: string[] = [];
  for (const file of routeFiles(routeRoot)) {
    const path = relative(routeRoot, dirname(file))
      .split(sep)
      .join('/')
      .replace(/\[([^\]]+)\]/g, ':$1');
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)) {
      const heading = `### ${match[1]} /api/v1${path ? `/${path}` : ''}`;
      if (!headings.has(heading)) missing.push(heading);
    }
  }
  expect(missing.sort(), `Missing API reference headings:\n${missing.join('\n')}`).toEqual([]);
});
