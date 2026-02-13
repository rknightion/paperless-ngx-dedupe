import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('should run tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async tests', async () => {
    const result = await Promise.resolve('ok');
    expect(result).toBe('ok');
  });
});
