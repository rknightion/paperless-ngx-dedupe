import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/integration/**/*.integration.test.ts'],
    globals: false,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/integration-junit.xml',
    },
  },
});
