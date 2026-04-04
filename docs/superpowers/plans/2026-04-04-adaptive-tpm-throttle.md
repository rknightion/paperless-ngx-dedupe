# Adaptive TPM Throttle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cascading 429 TPM rate-limit failures during AI batch processing by adaptively throttling based on OpenAI response headers and pausing on rate-limit errors with automatic retry.

**Architecture:** A `TpmThrottle` class reads rate-limit headers from every OpenAI response to compute adaptive dispatch delays. When a 429 occurs, the entire dispatch pool pauses for the `retry-after` duration, and the failed document is re-queued for retry (up to 3 passes). The OpenAI provider is updated to expose headers and wrap SDK `RateLimitError` into `AiExtractionError`.

**Tech Stack:** TypeScript, OpenAI Node SDK (v6.x), Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/ai/tpm-throttle.ts` | Create | TpmThrottle class — pressure tracking, delay computation, pause management |
| `packages/core/src/ai/__tests__/tpm-throttle.test.ts` | Create | Unit tests for TpmThrottle |
| `packages/core/src/ai/providers/types.ts` | Modify | Add `RateLimitInfo`, `retryAfterMs` on error, `rateLimit` on result |
| `packages/core/src/ai/providers/openai.ts` | Modify | Use `withResponse()`, parse headers, catch `RateLimitError` |
| `packages/core/src/ai/__tests__/openai-headers.test.ts` | Create | Unit tests for header parsing helpers |
| `packages/core/src/ai/types.ts` | Modify | Add `rateLimitRetries`/`rateLimitPauses` to `AiBatchResult` |
| `packages/core/src/ai/batch.ts` | Modify | Integrate throttle, retry queue, enhanced progress |
| `packages/core/src/ai/__tests__/batch.test.ts` | Modify | Add tests for retry queue and throttle integration |
| `packages/core/src/jobs/workers/ai-processing-worker.ts` | Modify | Cap maxRetries to 2 for batch context |
| `packages/core/src/index.ts` | Modify | Re-export new types |

---

### Task 1: TpmThrottle Class (TDD)

**Files:**
- Create: `packages/core/src/ai/tpm-throttle.ts`
- Create: `packages/core/src/ai/__tests__/tpm-throttle.test.ts`

- [ ] **Step 1: Write failing tests for TpmThrottle**

Create `packages/core/src/ai/__tests__/tpm-throttle.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TpmThrottle } from '../tpm-throttle.js';
import type { RateLimitInfo } from '../providers/types.js';

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
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 2_500_000, resetTokensMs: 60_000 });
      expect(throttle.getDelay()).toBe(0);
    });

    it('returns 50ms when 50-70% TPM used', () => {
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 1_500_000, resetTokensMs: 60_000 });
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
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 2_000_000, resetTokensMs: 60_000 });
      expect(throttle.getDelay()).toBe(0);
    });

    it('returns 50ms at exactly 70% boundary (< 70% threshold, >= 50%)', () => {
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 1_200_000, resetTokensMs: 60_000 });
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
      // 90% used → 500ms pressure delay
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 400_000, resetTokensMs: 60_000 });
      // 5000ms pause
      throttle.recordRateLimit(5000);
      // Pause is larger
      expect(throttle.getDelay()).toBe(5000);
      // After 4600ms, pause remaining (400ms) < pressure (500ms)
      vi.advanceTimersByTime(4600);
      expect(throttle.getDelay()).toBe(500);
    });

    it('multiple 429s extend the pause (latest wins)', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(3000);
      vi.advanceTimersByTime(1000);
      throttle.recordRateLimit(5000); // extends to now+5000
      expect(throttle.getDelay()).toBe(5000);
    });

    it('earlier pause does not shorten a longer existing pause', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      throttle.recordRateLimit(10000);
      vi.advanceTimersByTime(1000);
      throttle.recordRateLimit(2000); // would expire at now+2000, but existing expires at +9000
      expect(throttle.getDelay()).toBe(9000); // existing longer pause wins
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
      throttle.update({ limitTokens: 4_000_000, remainingTokens: 1_000_000, resetTokensMs: 60_000 });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/tpm-throttle.test.ts`

Expected: FAIL — module `../tpm-throttle.js` not found.

- [ ] **Step 3: Implement TpmThrottle**

Create `packages/core/src/ai/tpm-throttle.ts`:

```typescript
import type { RateLimitInfo } from './providers/types.js';

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
    if (used < 0.5) return 0;
    if (used < 0.7) return 50;
    if (used < 0.85) return 200;
    if (used < 0.95) return 500;
    return 2000;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/tpm-throttle.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/tpm-throttle.ts packages/core/src/ai/__tests__/tpm-throttle.test.ts
git commit -m "feat(ai): add TpmThrottle class for adaptive TPM rate limiting"
```

---

### Task 2: Add Types — RateLimitInfo, retryAfterMs, AiBatchResult Fields

**Files:**
- Modify: `packages/core/src/ai/providers/types.ts`
- Modify: `packages/core/src/ai/types.ts`

- [ ] **Step 1: Add RateLimitInfo and update AiExtractionResult and AiExtractionError**

In `packages/core/src/ai/providers/types.ts`, add the `RateLimitInfo` interface and update `AiExtractionResult` and `AiExtractionError`:

```typescript
// Add after AiProviderUsage interface (after line 27):
export interface RateLimitInfo {
  limitTokens: number;
  remainingTokens: number;
  resetTokensMs: number;
}
```

Add `rateLimit` to `AiExtractionResult`:

```typescript
// Change AiExtractionResult (lines 29-32) to:
export interface AiExtractionResult {
  response: AiExtractionResponse;
  usage: AiProviderUsage;
  rateLimit?: RateLimitInfo;
}
```

Add `retryAfterMs` to `AiExtractionError`:

```typescript
// Change AiExtractionError class (lines 41-50) to:
export class AiExtractionError extends Error {
  constructor(
    public readonly failureType: AiFailureType,
    message: string,
    public readonly requestId?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiExtractionError';
  }
}
```

- [ ] **Step 2: Add rateLimitRetries and rateLimitPauses to AiBatchResult**

In `packages/core/src/ai/types.ts`, update the `AiBatchResult` interface (after line 176, before the closing `}`):

```typescript
// Change AiBatchResult (lines 167-178) to:
export interface AiBatchResult {
  totalDocuments: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationMs: number;
  autoApplied?: number;
  autoApplySkipped?: number;
  rateLimitRetries: number;
  rateLimitPauses: number;
}
```

- [ ] **Step 3: Run type check to verify no regressions**

Run: `pnpm --filter @paperless-dedupe/core check`

Expected: May show errors in `batch.ts` because `AiBatchResult` now requires the new fields — that's expected and will be fixed in Task 5. Verify no OTHER errors. If the type checker fails on batch.ts only, that's fine.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/ai/providers/types.ts packages/core/src/ai/types.ts
git commit -m "feat(ai): add RateLimitInfo type and rate limit tracking fields"
```

---

### Task 3: OpenAI Provider — Header Extraction and RateLimitError Wrapping

**Files:**
- Modify: `packages/core/src/ai/providers/openai.ts`
- Create: `packages/core/src/ai/__tests__/openai-headers.test.ts`

- [ ] **Step 1: Write failing tests for header parsing helpers**

Create `packages/core/src/ai/__tests__/openai-headers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRateLimitHeaders, parseResetDuration, parseRetryAfterMs } from '../providers/openai.js';

describe('parseResetDuration', () => {
  it('parses milliseconds ("6ms")', () => {
    expect(parseResetDuration('6ms')).toBe(6);
  });

  it('parses seconds ("1s")', () => {
    expect(parseResetDuration('1s')).toBe(1000);
  });

  it('parses fractional seconds ("1.5s")', () => {
    expect(parseResetDuration('1.5s')).toBe(1500);
  });

  it('parses combined minutes and seconds ("1m30s")', () => {
    expect(parseResetDuration('1m30s')).toBe(90_000);
  });

  it('parses minutes only ("2m")', () => {
    expect(parseResetDuration('2m')).toBe(120_000);
  });

  it('returns null for empty string', () => {
    expect(parseResetDuration('')).toBeNull();
  });

  it('returns null for unparseable value', () => {
    expect(parseResetDuration('foo')).toBeNull();
  });
});

describe('parseRetryAfterMs', () => {
  it('parses float seconds to ms', () => {
    expect(parseRetryAfterMs('0.049')).toBe(49);
  });

  it('parses whole seconds to ms', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
  });

  it('returns 5000 (default) for null', () => {
    expect(parseRetryAfterMs(null)).toBe(5000);
  });

  it('returns 5000 (default) for unparseable value', () => {
    expect(parseRetryAfterMs('not-a-number')).toBe(5000);
  });
});

describe('parseRateLimitHeaders', () => {
  it('parses all three headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': '4000000',
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    const result = parseRateLimitHeaders(headers);
    expect(result).toEqual({
      limitTokens: 4_000_000,
      remainingTokens: 3_500_000,
      resetTokensMs: 6,
    });
  });

  it('returns undefined when limit-tokens header is missing', () => {
    const headers = new Headers({
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when remaining-tokens header is missing', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': '4000000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when headers have non-numeric values', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': 'abc',
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/openai-headers.test.ts`

Expected: FAIL — functions not exported from `../providers/openai.js`.

- [ ] **Step 3: Add header parsing helpers to openai.ts**

Add these exported functions at the top of `packages/core/src/ai/providers/openai.ts` (after the imports, before the class):

```typescript
import type {
  AiProviderInterface,
  AiExtractionRequest,
  AiExtractionResult,
  AiExtractionResponse,
  RateLimitInfo,
} from './types.js';
import { AiExtractionError, aiExtractionResponseSchema } from './types.js';

/** Parse OpenAI's x-ratelimit-reset-tokens duration string (e.g., "6ms", "1.5s", "1m30s") to ms. */
export function parseResetDuration(value: string): number | null {
  if (!value) return null;

  let totalMs = 0;
  let matched = false;

  const minMatch = value.match(/(\d+)m(?!s)/);
  if (minMatch) {
    totalMs += parseInt(minMatch[1], 10) * 60_000;
    matched = true;
  }

  const secMatch = value.match(/([\d.]+)s/);
  if (secMatch) {
    totalMs += parseFloat(secMatch[1]) * 1000;
    matched = true;
  }

  const msMatch = value.match(/(\d+)ms/);
  if (msMatch) {
    totalMs += parseInt(msMatch[1], 10);
    matched = true;
  }

  return matched ? Math.round(totalMs) : null;
}

/** Parse retry-after header (float seconds) to ms. Returns 5000ms default if missing/unparseable. */
export function parseRetryAfterMs(value: string | null): number {
  if (!value) return 5000;
  const seconds = parseFloat(value);
  if (isNaN(seconds)) return 5000;
  return Math.round(seconds * 1000);
}

/** Parse rate limit headers from an OpenAI response. Returns undefined if any required header is missing. */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limitStr = headers.get('x-ratelimit-limit-tokens');
  const remainingStr = headers.get('x-ratelimit-remaining-tokens');
  const resetStr = headers.get('x-ratelimit-reset-tokens');

  if (!limitStr || !remainingStr) return undefined;

  const limitTokens = parseInt(limitStr, 10);
  const remainingTokens = parseInt(remainingStr, 10);

  if (isNaN(limitTokens) || isNaN(remainingTokens)) return undefined;

  const resetTokensMs = resetStr ? (parseResetDuration(resetStr) ?? 0) : 0;

  return { limitTokens, remainingTokens, resetTokensMs };
}
```

- [ ] **Step 4: Run header parsing tests to verify they pass**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/openai-headers.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Update the extract() method to use withResponse() and catch RateLimitError**

Replace the `extract()` method in `packages/core/src/ai/providers/openai.ts`:

```typescript
  async extract(request: AiExtractionRequest): Promise<AiExtractionResult> {
    const { zodTextFormat } = await import('openai/helpers/zod');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = {
      model: this.model,
      input: [
        { role: 'developer', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      text: { format: zodTextFormat(aiExtractionResponseSchema, 'document_classification') },
    };

    params.service_tier = this.flexProcessing ? 'flex' : 'default';

    if (request.reasoningEffort && request.reasoningEffort !== 'none') {
      params.reasoning = { effort: request.reasoningEffort };
    }

    let response;
    let rateLimit: RateLimitInfo | undefined;

    try {
      const { data, response: httpResponse } = await this.client.responses
        .parse(params)
        .withResponse();
      response = data;
      rateLimit = parseRateLimitHeaders(httpResponse.headers);
    } catch (error) {
      // Catch OpenAI SDK RateLimitError and wrap it
      if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
        const sdkError = error as { message: string; headers?: Headers; requestID?: string };
        const retryAfterMs = parseRetryAfterMs(
          sdkError.headers?.get('retry-after') ?? null,
        );
        throw new AiExtractionError(
          'rate_limit',
          sdkError.message,
          sdkError.requestID,
          retryAfterMs,
        );
      }
      throw error;
    }

    // Check for refusal
    if (response.refusal) {
      throw new AiExtractionError('refusal', response.refusal, response.id);
    }

    // Check for incomplete response
    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      const failureType = reason === 'max_output_tokens' ? 'max_tokens' : 'timeout';
      throw new AiExtractionError(failureType, `Incomplete response: ${reason}`, response.id);
    }

    // Use SDK-parsed output
    if (!response.output_parsed) {
      throw new AiExtractionError('schema_mismatch', 'No parsed output in response', response.id);
    }

    try {
      const parsed = aiExtractionResponseSchema.parse(
        response.output_parsed,
      ) as AiExtractionResponse;
      return {
        response: parsed,
        usage: {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          cachedTokens: response.usage?.input_tokens_details?.cached_tokens,
        },
        rateLimit,
      };
    } catch (error) {
      throw new AiExtractionError(
        'schema_mismatch',
        `Schema validation failed: ${(error as Error).message}`,
        response.id,
      );
    }
  }
```

- [ ] **Step 6: Run all existing tests to verify no regressions**

Run: `pnpm --filter @paperless-dedupe/core test`

Expected: All tests PASS (existing tests don't depend on the response shape including `rateLimit` since it's optional).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ai/providers/openai.ts packages/core/src/ai/__tests__/openai-headers.test.ts
git commit -m "feat(ai): extract rate limit headers from OpenAI responses and wrap RateLimitError"
```

---

### Task 4: Integrate TpmThrottle into Batch Processing

**Files:**
- Modify: `packages/core/src/ai/batch.ts`
- Modify: `packages/core/src/ai/__tests__/batch.test.ts`

- [ ] **Step 1: Write failing tests for retry queue and throttle integration**

Add the following tests to `packages/core/src/ai/__tests__/batch.test.ts`. Add them inside a new `describe('rate limit retry queue', ...)` block at the bottom of the file, inside the outer test structure:

```typescript
describe('rate limit retry queue', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedManyDocs(db: AppDatabase, count: number) {
    const docs = [];
    const contents = [];
    for (let i = 1; i <= count; i++) {
      docs.push({
        id: `doc-${i}`,
        paperlessId: i,
        title: `Doc ${i}`,
        processingStatus: 'completed' as const,
        syncedAt: '2024-01-01T00:00:00Z',
      });
      contents.push({
        documentId: `doc-${i}`,
        fullText: `Content for document ${i}`,
        contentHash: `hash${i}`,
      });
    }
    db.insert(document).values(docs).run();
    db.insert(documentContent).values(contents).run();
  }

  it('retries rate-limited documents instead of marking them as failed', async () => {
    seedManyDocs(db, 3);

    let callCount = 0;
    const extractFn = vi.fn().mockImplementation(async () => {
      callCount++;
      // First 3 calls: rate limit errors. Subsequent calls: succeed.
      if (callCount <= 3) {
        throw new AiExtractionError('rate_limit', 'Rate limited', undefined, 50);
      }
      return {
        response: {
          title: 'Test',
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.rateLimitRetries).toBe(3);
    expect(result.rateLimitPauses).toBeGreaterThan(0);
    expect(extractFn).toHaveBeenCalledTimes(6); // 3 initial + 3 retries
  });

  it('records permanent failure after max retry passes', async () => {
    seedManyDocs(db, 1);

    // Always rate limit
    const extractFn = vi.fn().mockRejectedValue(
      new AiExtractionError('rate_limit', 'Rate limited', undefined, 10),
    );

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    // 1 initial + 3 retry passes = 4 total attempts
    expect(extractFn).toHaveBeenCalledTimes(4);

    const dbResults = db.select().from(aiProcessingResult).all();
    expect(dbResults).toHaveLength(1);
    expect(dbResults[0].appliedStatus).toBe('failed');
    expect(dbResults[0].failureType).toBe('rate_limit');
  });

  it('tracks rateLimitRetries and rateLimitPauses in result', async () => {
    seedManyDocs(db, 2);

    let callCount = 0;
    const extractFn = vi.fn().mockImplementation(async () => {
      callCount++;
      // Rate limit the first call only
      if (callCount === 1) {
        throw new AiExtractionError('rate_limit', 'Rate limited', undefined, 10);
      }
      return {
        response: {
          title: 'Test',
          correspondent: 'Test',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.9, tags: 0.5 },
          evidence: 'test',
        },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const provider = createMockProvider({ extractFn });
    const client = createMockClient();
    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    const result = await processBatch(db, { provider, client, config: seqConfig });

    expect(result.rateLimitRetries).toBe(1);
    expect(result.rateLimitPauses).toBe(1);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/batch.test.ts`

Expected: FAIL — `rateLimitRetries` and `rateLimitPauses` not present on result; retry behavior not implemented.

- [ ] **Step 3: Implement throttle integration in batch.ts**

Modify `packages/core/src/ai/batch.ts`. The changes are:

**Add import** at the top:

```typescript
import { TpmThrottle } from './tpm-throttle.js';
```

**Update the `result` initialization** (around line 165) to include the new fields:

```typescript
const result: AiBatchResult = {
  totalDocuments: totalDocs,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  durationMs: 0,
  rateLimitRetries: 0,
  rateLimitPauses: 0,
};
```

**Add throttle and retry queue** before the `processOne` function (after `circuitBreakerError` declaration, around line 232):

```typescript
const throttle = new TpmThrottle();
const retryQueue: typeof processableDocs = [];
const MAX_RETRY_PASSES = 3;
```

**Modify `processOne` to update throttle on success and queue rate-limited docs for retry:**

In the success path (after `result.succeeded++` around line 331), add:

```typescript
// Update throttle from rate limit headers
if (extraction.rateLimit) {
  throttle.update(extraction.rateLimit);
}
```

In the error handler, change the rate-limit handling. Replace the block starting at line 398 (`const isRateLimit = ...`) through line 423 (end of circuit breaker block) with:

```typescript
// Rate limit errors: queue for retry instead of recording as failure
const isRateLimit = isAiError && error.failureType === 'rate_limit';
if (isRateLimit) {
  retryQueue.push(doc);
  result.rateLimitRetries++;
  const retryAfterMs = error.retryAfterMs ?? 5000;
  throttle.recordRateLimit(retryAfterMs);
  result.rateLimitPauses++;
  logger.warn(
    { documentId: doc.id, retryAfterMs },
    'Document rate-limited — queued for retry',
  );
  // Do NOT increment result.processed — doc hasn't been processed yet
  // Do NOT record failure in DB — will retry later
  // Skip the progress update below
  return;
}

// Circuit breaker: track consecutive same errors (skip rate limits)
if (errorMsg === lastErrorMsg) {
  consecutiveSameError++;
} else {
  consecutiveSameError = 1;
  lastErrorMsg = errorMsg;
}

if (consecutiveSameError >= CIRCUIT_BREAKER_THRESHOLD) {
  circuitBroken = true;
  circuitBreakerError = new Error(
    `Processing stopped: ${CIRCUIT_BREAKER_THRESHOLD} consecutive documents failed with the same error: ${errorMsg}`,
    { cause: error },
  );

  logger.error(
    { consecutiveFailures: CIRCUIT_BREAKER_THRESHOLD, error: errorMsg },
    'Circuit breaker triggered — stopping batch',
  );
}
```

**Replace the rate-limit delay in the dispatch loop.** Change the sleep at the end of the loop (around line 452-455) from:

```typescript
// Rate-limit: pause before launching the next request
if (i < processableDocs.length - 1 && intervalMs > 0) {
  await sleep(intervalMs);
}
```

to:

```typescript
// Rate-limit: pause before launching the next request (throttle-aware)
if (i < processableDocs.length - 1) {
  const delay = Math.max(throttle.getDelay(), intervalMs);
  if (delay > 0) await sleep(delay);
}
```

**Add retry loop** after the existing `await Promise.allSettled(pending)` drain (around line 459). Insert BEFORE `result.durationMs = ...`:

```typescript
// Retry rate-limited documents (up to MAX_RETRY_PASSES)
for (let pass = 0; pass < MAX_RETRY_PASSES && retryQueue.length > 0; pass++) {
  const retryDocs = retryQueue.splice(0);

  logger.info(
    { retryPass: pass + 1, count: retryDocs.length },
    'Retrying rate-limited documents',
  );
  await onProgress?.(
    result.processed / totalDocs,
    `Retry pass ${pass + 1}: re-processing ${retryDocs.length} rate-limited documents`,
  );

  // Wait for any active throttle pause to expire
  const pauseDelay = throttle.getDelay();
  if (pauseDelay > 0) await sleep(pauseDelay);

  for (let i = 0; i < retryDocs.length; i++) {
    if (circuitBroken) break;

    if (pending.size >= maxConcurrency) {
      await Promise.race(pending);
    }
    if (circuitBroken) break;

    const delay = Math.max(throttle.getDelay(), intervalMs);
    if (delay > 0) await sleep(delay);

    const doc = retryDocs[i];
    const promise = processOne(doc);
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
  }

  await Promise.allSettled(pending);
}

// Record permanent failures for docs that exhausted all retry passes
for (const doc of retryQueue) {
  const now = new Date().toISOString();
  db.insert(aiProcessingResult)
    .values({
      documentId: doc.id,
      paperlessId: doc.paperlessId,
      provider: provider.provider,
      model: config.model,
      errorMessage: 'Rate limit exceeded after all retry passes',
      failureType: 'rate_limit',
      appliedStatus: 'failed',
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: aiProcessingResult.documentId,
      set: {
        errorMessage: 'Rate limit exceeded after all retry passes',
        failureType: 'rate_limit',
        appliedStatus: 'failed',
        createdAt: now,
      },
    })
    .run();

  result.failed++;
  result.processed++;
  aiDocumentsTotal().add(1, { outcome: 'failed', 'gen_ai.system': provider.provider });
}
```

**Enhance progress messages** in `processOne` to include throttle state. Replace the `onProgress` call at the end of `processOne` (around line 427-430):

```typescript
// Build throttle-aware progress message
const status = throttle.getStatus();
let progressMsg = `Processed ${result.processed} of ${totalDocs} documents (${result.succeeded} succeeded, ${result.failed} failed)`;
if (status.paused) {
  progressMsg = `Paused for rate limit — resuming in ${Math.ceil(status.pauseRemainingMs / 1000)}s (${result.processed} of ${totalDocs} processed)`;
} else if (status.pressure >= 0.5) {
  progressMsg += ` [throttled: ${Math.round(status.pressure * 100)}% TPM used]`;
}
await onProgress?.(result.processed / totalDocs, progressMsg);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @paperless-dedupe/core test -- src/ai/__tests__/batch.test.ts`

Expected: All tests PASS (both existing and new).

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter @paperless-dedupe/core test`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ai/batch.ts packages/core/src/ai/__tests__/batch.test.ts
git commit -m "feat(ai): integrate TpmThrottle into batch processing with retry queue"
```

---

### Task 5: Reduce SDK maxRetries for Batch Processing

**Files:**
- Modify: `packages/core/src/jobs/workers/ai-processing-worker.ts`

- [ ] **Step 1: Cap maxRetries to 2 in the worker**

In `packages/core/src/jobs/workers/ai-processing-worker.ts`, change the `createAiProvider` call (line 29-34) to cap maxRetries:

```typescript
  // Cap SDK retries to 2 for batch processing — the batch-level retry queue
  // handles rate limit recovery globally, so we want fast 429 detection
  const batchMaxRetries = Math.min(aiConfig.maxRetries, 2);

  const provider = await createAiProvider(
    apiKey,
    aiConfig.model,
    batchMaxRetries,
    aiConfig.flexProcessing,
  );
```

- [ ] **Step 2: Run full test suite to verify no regressions**

Run: `pnpm --filter @paperless-dedupe/core test`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/jobs/workers/ai-processing-worker.ts
git commit -m "feat(ai): cap SDK maxRetries to 2 for batch processing context"
```

---

### Task 6: Update Exports and Fix Existing Test

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/ai/__tests__/batch.test.ts` (update existing rate_limit test)

- [ ] **Step 1: Add new exports to index.ts**

In `packages/core/src/index.ts`, add the TpmThrottle and RateLimitInfo exports.

In the AI providers type exports section (around line 269-277), add `RateLimitInfo`:

```typescript
export type {
  AiExtractionRequest,
  AiExtractionResponse,
  AiProviderUsage,
  AiExtractionResult,
  AiProviderInterface,
  AiFailureType,
  RateLimitInfo,
} from './ai/providers/types.js';
```

After the `processBatch` export (around line 283-284), add:

```typescript
export { TpmThrottle } from './ai/tpm-throttle.js';
export type { TpmThrottleStatus } from './ai/tpm-throttle.js';
```

- [ ] **Step 2: Update existing rate_limit test to account for retry queue**

The existing test `'rate_limit errors do not trip the circuit breaker'` (around line 220-235 in batch.test.ts) now needs to account for the retry queue. Rate-limited docs are retried instead of immediately failing. Update it:

```typescript
  it('rate_limit errors do not trip the circuit breaker', async () => {
    seedDocs(db);

    const error = new AiExtractionError('rate_limit', 'Rate limited', undefined, 10);
    const provider = createMockProvider({
      extractFn: vi.fn().mockRejectedValue(error),
    });
    const client = createMockClient();

    const seqConfig: AiConfig = { ...config, batchSize: 1 };

    // Rate-limited docs are retried (up to 3 passes) then permanently failed
    // Circuit breaker should NOT fire
    const result = await processBatch(db, { provider, client, config: seqConfig });
    // 2 processable docs, each retried 3 times + 1 initial = 4 attempts each
    // Both end as failed after retry exhaustion, plus 1 skipped (no content)
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.rateLimitRetries).toBeGreaterThan(0);
  });
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @paperless-dedupe/core test`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/ai/__tests__/batch.test.ts
git commit -m "feat(ai): export TpmThrottle and RateLimitInfo, update rate_limit test"
```

---

### Task 7: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run linter**

Run: `pnpm lint`

Expected: No errors. If there are lint errors in changed files, fix them.

- [ ] **Step 2: Run formatter**

Run: `pnpm format`

Expected: No formatting issues. If there are, run `pnpm format:fix` and commit.

- [ ] **Step 3: Run type check across all packages**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`

Expected: All tests PASS.

- [ ] **Step 5: Run full build**

Run: `pnpm build`

Expected: Build succeeds with zero errors.

- [ ] **Step 6: Fix any issues found and commit**

If any issues were found in steps 1-5, fix them and commit:

```bash
git add -A
git commit -m "fix(ai): address lint/format/type issues from TPM throttle integration"
```
