import { startMockPaperless } from './fixtures/mock-paperless';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.resolve(import.meta.dirname, '../data/e2e-test.db');

export default async function globalSetup() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Remove existing test database so the app can create it fresh with proper migration
  for (const suffix of ['', '-wal', '-shm']) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // Start mock Paperless server
  await startMockPaperless();
  console.log('Mock Paperless server started on port 18923');
}
