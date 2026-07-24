import { coverageThresholds } from '../coverage-thresholds.js';
import { describe, expect, it } from 'vitest';

describe('current-source coverage gate', () => {
  it('enforces thresholds for the current TypeScript source tree', () => {
    expect(coverageThresholds).toEqual({
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    });
  });
});
