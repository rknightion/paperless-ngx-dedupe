import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TpmThrottle } from '../tpm-throttle.js';

describe('TpmThrottle', () => {
  let throttle: TpmThrottle;

  beforeEach(() => {
    throttle = new TpmThrottle();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getDelay (no data)', () => {
    it('returns 0 when no header data has been received', () => {
      expect(throttle.getDelay()).toBe(0);
    });
  });

  describe('getDelay (pressure-based)', () => {
    it('returns 0ms when less than 50% TPM used', () => {
      throttle.update({
        limitTokens: 4_000_000,
        remainingTokens: 2_500_000,
        resetTokensMs: 60_000,
      });
      expect(throttle.getDelay()).toBe(0);
    });

    it('returns 50ms when 50-70% TPM used', () => {
      throttle.update({
        limitTokens: 4_000_000,
        remainingTokens: 1_500_000,
        resetTokensMs: 60_000,
      });
      expect(throttle.getDelay()).toBe(50);
    });

    it('returns 200ms when 70-85% TPM used', () => {
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 800_000, resetTokensMs: 60_000 });
      expect(throttle.getDelay()).toBe(200);
    });

    it('returns 500ms when 85-95% TPM used', () => {
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 400_000, resetTokensMs: 60_000 });
      expect(throttle.getDelay()).toBe(500);
    });

    it('returns 2000ms when more than 95% TPM used', () => {
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 100_000, resetTokensMs: 60_000 });
      expect(throttle.getDelay()).toBe(2000);
    });

    it('returns 0ms at exactly 50% boundary (< 50% threshold)', () => {
      throttle.update({
        limitTokens: 4_000_000,
        remainingTokens: 2_000_000,
        resetTokensMs: 60_000,
      });
      expect(throttle.getDelay()).toBe(0);
    });

    it('returns 50ms at exactly 70% boundary (< 70% threshold, >= 50%)', () => {
      throttle.update({
        limitTokens: 4_000_000,
        remainingTokens: 1_200_000,
        resetTokensMs: 60_000,
      });
      expect(throttle.getDelay()).toBe(50);
    });
  });

  describe('recordRateLimit (pool pause)', () => {
    it('pauses for the specified duration', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(5000);
      expect(throttle.getDelay()).toBe(5000);
    });

    it('pause decreases over time', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(5000);
      vi.advanceTimersByTime(3000);
      expect(throttle.getDelay()).toBe(2000);
    });

    it('pause expires after full duration', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(5000);
      vi.advanceTimersByTime(5000);
      expect(throttle.getDelay()).toBe(0);
    });

    it('returns max of pause and pressure delay', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 400_000, resetTokensMs: 60_000 });
      throttle.recordRateLimit(5000);
      expect(throttle.getDelay()).toBe(5000);
      vi.advanceTimersByTime(4600);
      expect(throttle.getDelay()).toBe(500);
    });

    it('multiple 429s extend the pause (latest wins)', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(3000);
      vi.advanceTimersByTime(1000);
      throttle.recordRateLimit(5000);
      expect(throttle.getDelay()).toBe(5000);
    });

    it('earlier pause does not shorten a longer existing pause', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(10000);
      vi.advanceTimersByTime(1000);
      throttle.recordRateLimit(2000);
      expect(throttle.getDelay()).toBe(9000);
    });
  });

  describe('getStatus', () => {
    it('returns zero pressure when no data', () => {
      const status = throttle.getStatus();
      expect(status.pressure).toBe(0);
      expect(status.delayMs).toBe(0);
      expect(status.paused).toBe(false);
      expect(status.pauseRemainingMs).toBe(0);
    });

    it('returns correct pressure ratio', () => {
      throttle.update({
        limitTokens: 4_000_000,
        remainingTokens: 1_000_000,
        resetTokensMs: 60_000,
      });
      const status = throttle.getStatus();
      expect(status.pressure).toBeCloseTo(0.75);
      expect(status.delayMs).toBe(200);
      expect(status.paused).toBe(false);
    });

    it('reports paused state correctly', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(3000);
      const status = throttle.getStatus();
      expect(status.paused).toBe(true);
      expect(status.pauseRemainingMs).toBe(3000);
    });
  });
});
