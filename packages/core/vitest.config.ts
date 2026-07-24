import { defineConfig } from 'vitest/config';
import { coverageThresholds } from './src/coverage-thresholds.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
      thresholds: coverageThresholds,
    },
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/junit.xml',
    },
  },
});
