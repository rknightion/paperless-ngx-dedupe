import { stopMockPaperless } from './fixtures/mock-paperless';

export default async function globalTeardown() {
  await stopMockPaperless();
  console.log('Mock Paperless server stopped');
}
