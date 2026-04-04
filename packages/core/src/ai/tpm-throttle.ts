import { type RateLimitInfo } from './providers/types.js';

export interface TpmThrottleStatus {
  pressure: number;
  delayMs: number;
  paused: boolean;
  pauseRemainingMs: number;
}

export class TpmThrottle {
  private remainingTokens: number | null = null;
  private limitTokens: number | null = null;
  private pauseUntil = 0;

  update(info: RateLimitInfo): void {
    this.remainingTokens = info.remainingTokens;
    this.limitTokens = info.limitTokens;
  }

  recordRateLimit(retryAfterMs: number): void {
    const newPauseUntil = Date.now() + retryAfterMs;
    this.pauseUntil = Math.max(this.pauseUntil, newPauseUntil);
  }

  getDelay(): number {
    const pauseRemaining = Math.max(0, this.pauseUntil - Date.now());
    const pressureDelay = this.computePressureDelay();
    return Math.max(pauseRemaining, pressureDelay);
  }

  getStatus(): TpmThrottleStatus {
    const pauseRemainingMs = Math.max(0, this.pauseUntil - Date.now());
    return {
      pressure: this.computePressure(),
      delayMs: this.getDelay(),
      paused: pauseRemainingMs > 0,
      pauseRemainingMs,
    };
  }

  private computePressure(): number {
    if (this.remainingTokens === null || this.limitTokens === null || this.limitTokens === 0) {
      return 0;
    }
    return 1 - this.remainingTokens / this.limitTokens;
  }

  private computePressureDelay(): number {
    const used = this.computePressure();
    if (used <= 0.5) return 0;
    if (used <= 0.7) return 50;
    if (used <= 0.85) return 200;
    if (used <= 0.95) return 500;
    return 2000;
  }
}
