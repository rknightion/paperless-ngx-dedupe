import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/pipeline/__tests__/**/*.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 600_000,
    globals: false,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/pipeline-junit.xml',
    },
  },
});
