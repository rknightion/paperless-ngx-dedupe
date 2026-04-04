# Adaptive TPM Throttle for AI Batch Processing

## Problem

When batch processing documents with high concurrency (e.g., `batchSize: 100`), all concurrent requests share the same OpenAI TPM (tokens per minute) budget. The current system throttles by RPM only (inter-request delay), which does not account for token volume. A batch of 100 concurrent document extractions easily exceeds the 4M TPM ceiling, causing cascading 429 errors that exhaust the SDK's retry budget and result in permanent failures.

The core issue: RPM-based throttling is orthogonal to TPM limits. A single large document can consume more tokens than 50 small ones. The system needs to throttle based on actual token budget consumption, not just request count.

## Solution: Header-Driven Adaptive Throttle with Pool Pause

A two-layer approach:

1. **Proactive**: Read OpenAI's rate limit response headers on every successful response to track remaining TPM budget, and progressively slow down as the budget depletes.
2. **Reactive**: When a 429 does occur, pause the entire dispatch pool for the `retry-after` duration and re-queue the failed document for retry.

### Design Goals

- **Reliability first**: Zero rate-limit failures under normal operation. The throttle should prevent 429s, not just recover from them.
- **Adaptive throughput**: Start fast, slow down as pressure builds, recover when budget replenishes. Don't leave capacity on the table.
- **Visibility**: Report throttle state in job progress so the user can see what's happening.
- **No new config knobs**: The system reads its limits from OpenAI's headers. No manual TPM configuration needed.

## Components

### 1. Rate Limit Header Extraction (`providers/openai.ts`)

**Change**: Switch from `await client.responses.parse(params)` to `await client.responses.parse(params).withResponse()`, which returns `{ data, response }` where `response` is the raw HTTP response with headers.

**Headers parsed on every successful response**:
- `x-ratelimit-limit-tokens` — total TPM ceiling (e.g., 4,000,000)
- `x-ratelimit-remaining-tokens` — tokens remaining in the current minute window
- `x-ratelimit-reset-tokens` — time until token budget fully resets (e.g., "6ms", "1s")

**On rate limit errors**: The SDK's `RateLimitError` exposes `error.headers` from the final 429 response. Parse `retry-after` (seconds) for the pool pause duration.

**New type** on `AiExtractionResult`:

```typescript
export interface RateLimitInfo {
  limitTokens: number;      // total TPM ceiling from x-ratelimit-limit-tokens
  remainingTokens: number;  // tokens left from x-ratelimit-remaining-tokens
  resetTokensMs: number;    // duration (ms) until budget resets, from x-ratelimit-reset-tokens
                            // (this is a duration, not an absolute timestamp)
}
```

The field is optional (`rateLimit?: RateLimitInfo`). If headers are missing or unparseable, it's omitted and the throttle operates without data (pass-through mode).

**SDK maxRetries reduction**: Reduce from 10 to 2 for batch processing. The change is made in `ai-processing-worker.ts` where the `OpenAiProvider` is created — pass `maxRetries: 2` regardless of the user's config setting (which controls non-batch contexts). With 10 retries, the SDK spends significant time retrying while other concurrent requests continue saturating the budget. Fewer retries means faster detection of TPM exhaustion, which triggers the pool-level pause sooner. The batch retry queue (up to 3 passes) handles recovery at a global level where it can control all dispatches — total retry surface is larger than before, just better orchestrated.

**retry-after parsing**: The `retry-after` HTTP header value is a float in seconds (e.g., `"0.049"` for 49ms). Convert to ms by multiplying by 1000. Do NOT parse the human-readable error message text ("Please try again in 49ms") — use only the header. If the header is missing, default to 5000ms as a conservative fallback.

### 2. TpmThrottle Class (`ai/tpm-throttle.ts`, new file)

A lightweight controller that tracks TPM pressure and computes dispatch delays.

**State**:
- `remainingTokens: number | null` — last reported remaining tokens (null = no data yet)
- `limitTokens: number | null` — total TPM limit (null = no data yet)
- `pauseUntil: number` — timestamp until which no new requests should be dispatched (0 = not paused)

**Methods**:

```typescript
class TpmThrottle {
  /** Update pressure state from a successful response's headers */
  update(info: RateLimitInfo): void;

  /** Record a 429 event — pauses the pool for the given duration */
  recordRateLimit(retryAfterMs: number): void;

  /** Returns the recommended delay (ms) before the next dispatch.
   *  Accounts for both pressure-based slowdown and active pauses. */
  getDelay(): number;

  /** Returns current status for progress reporting */
  getStatus(): TpmThrottleStatus;
}
```

**Pressure-based delay curve**:

| TPM Used | Delay | Rationale |
|----------|-------|-----------|
| < 50%    | 0ms   | Plenty of headroom — full speed |
| 50-70%   | 50ms  | Light backpressure |
| 70-85%   | 200ms | Moderate slowdown |
| 85-95%   | 500ms | Heavy throttling, approaching limit |
| > 95%    | 2000ms | Near-full — crawl to avoid 429 |

The curve is intentionally stepped rather than continuous for simplicity and debuggability. The thresholds can be tuned later based on real-world behavior.

**Pause behavior**: When `recordRateLimit(retryAfterMs)` is called, `pauseUntil` is set to `Date.now() + retryAfterMs`. `getDelay()` returns `max(pressureDelay, pauseRemaining)`. Multiple 429s extend the pause (the latest `pauseUntil` wins if it's further in the future).

**Status** (for progress reporting):

```typescript
interface TpmThrottleStatus {
  pressure: number;      // 0.0-1.0 ratio of TPM used
  delayMs: number;       // current recommended delay
  paused: boolean;       // whether pool is in a 429 pause
  pauseRemainingMs: number; // ms until pause expires (0 if not paused)
}
```

### 3. Batch Loop Integration (`batch.ts`)

**Throttle-aware dispatch**: Replace the fixed `intervalMs` delay with `max(throttle.getDelay(), intervalMs)`. The RPM-based interval remains as a floor — the throttle only adds delay on top.

**Rate limit retry queue**: When `processOne()` catches a `rate_limit` error:
1. The document is pushed to a `retryQueue` (not recorded as a failure).
2. `throttle.recordRateLimit(retryAfterMs)` is called to pause the pool.
3. `result.processed` is not incremented (the doc hasn't been processed yet).

**Retry passes**: After the main dispatch loop drains, up to 3 retry passes process the `retryQueue`:
1. Wait for any active throttle pause to expire.
2. Process retry docs through the same throttle-aware pool.
3. Docs that fail with `rate_limit` again go back to the queue for the next pass.
4. After 3 passes, any remaining docs are recorded as permanent failures.

**Progress messages**: Enhanced to include throttle state when relevant:
- Normal: `"Processed 45 of 200 documents (43 succeeded, 2 failed)"`
- Throttled: `"Processed 45 of 200 documents (43 succeeded, 0 failed) [throttled: 87% TPM used]"`
- Paused: `"Paused for rate limit — resuming in 3s (45 of 200 processed)"`
- Retrying: `"Retry pass 1: re-processing 5 rate-limited documents"`

### 4. AiBatchResult Changes (`types.ts`)

Add two fields to track throttle behavior:

```typescript
interface AiBatchResult {
  // ... existing fields
  rateLimitRetries: number;   // docs re-queued due to rate limits
  rateLimitPauses: number;    // times the pool was paused for a 429
}
```

These give visibility into whether the throttle is working. If `rateLimitRetries` is consistently high, it suggests the batch size is too aggressive for the user's TPM tier.

## Data Flow

```
Request dispatched
        │
        ▼
   OpenAI API call
        │
   ┌────┴────┐
   │         │
 Success    429 Error
   │         │
   ▼         ▼
Read headers  Parse retry-after from error.headers
   │         │
   ▼         ▼
throttle.update()   throttle.recordRateLimit()
   │                Push doc to retryQueue
   ▼                │
Compute delay       ▼
for next dispatch   Pool pauses (getDelay returns pause duration)
   │                │
   ▼                ▼
Next request        Wait for pause to expire
sleeps for          │
delay ms            ▼
                    Process retryQueue
```

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/ai/tpm-throttle.ts` | **NEW** — TpmThrottle class |
| `packages/core/src/ai/providers/types.ts` | Add `RateLimitInfo` type, optional `rateLimit` on `AiExtractionResult` |
| `packages/core/src/ai/providers/openai.ts` | Use `withResponse()`, parse headers, attach to result, parse retry-after on errors |
| `packages/core/src/ai/batch.ts` | Integrate throttle, retry queue, enhanced progress messages |
| `packages/core/src/ai/types.ts` | Add `rateLimitRetries` and `rateLimitPauses` to `AiBatchResult` |
| `packages/core/src/index.ts` | Re-export `TpmThrottle` if needed for testing |

## Edge Cases

1. **First few requests (no header data)**: The throttle has no data and returns 0ms delay. The RPM-based `intervalMs` floor still applies. Risk of initial overshoot is low — the first batch of responses arrives within seconds and headers start flowing.

2. **Headers missing**: Defensive handling — if any header is absent or unparseable, `rateLimit` is `undefined` and the throttle operates in pass-through mode (delay = 0, RPM floor only).

3. **Flex processing tier**: Flex may have different rate limits. The throttle reads actual limits from headers, so it adapts automatically regardless of tier.

4. **Varying document sizes**: Large documents consume more tokens per request. The header-based approach naturally handles this — it tracks actual remaining budget, not estimated token counts.

5. **Multiple 429s in quick succession**: Each extends the pause. `pauseUntil` is set to `max(current pauseUntil, Date.now() + retryAfterMs)`.

6. **Circuit breaker interaction**: Rate limit errors are already excluded from the circuit breaker (`!isRateLimit` check at batch.ts:402). The retry queue handles them separately, so the circuit breaker only trips on non-rate-limit errors as before.

7. **Retry queue exhaustion**: After 3 retry passes, remaining docs are recorded as permanent failures with `failureType: 'rate_limit'`. This prevents infinite retry loops. In practice, 3 passes should be more than enough since the throttle will have backed off significantly by then.

## Testing Plan

1. **TpmThrottle unit tests**: Pressure calculations at each threshold boundary, pause expiration, multiple 429s, no-data pass-through mode, status reporting.

2. **Header parsing unit tests**: Valid headers, missing headers, malformed values, reset-tokens duration parsing (e.g., "6ms", "1.5s", "1m30s").

3. **Batch retry integration tests**: Mock provider that returns rate_limit errors on first attempts, verify docs are retried and eventually succeed, verify pool pauses, verify progress messages include throttle state.
