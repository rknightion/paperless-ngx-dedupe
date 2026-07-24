import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(e2eDirectory, '../data/e2e-test.db');

export const E2E_DATABASE_PATHS = Object.freeze([
  databasePath,
  `${databasePath}-wal`,
  `${databasePath}-shm`,
]);

export function cleanupE2eDatabase(remove: (path: string) => void = removeFile): void {
  for (const path of E2E_DATABASE_PATHS) remove(path);
}

export function withE2ePrestart(command: string): string {
  return `node e2e/prestart-cleanup.ts && ${command}`;
}

function removeFile(path: string): void {
  rmSync(path, { force: true });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) cleanupE2eDatabase();
