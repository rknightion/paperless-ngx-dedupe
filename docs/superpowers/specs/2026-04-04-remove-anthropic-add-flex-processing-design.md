# Remove Anthropic API Support & Add OpenAI Flex Processing

**Date:** 2026-04-04
**Status:** Draft

## Overview

Two changes to the AI processing pipeline:

1. **Remove Anthropic API support entirely** — unused, untested code that adds maintenance burden.
2. **Add OpenAI Flex Processing** — ~50% cost reduction for background AI metadata extraction by using OpenAI's flex service tier.

## Part 1: Remove Anthropic API Support

### Code Changes

#### Delete

- `packages/core/src/ai/providers/anthropic.ts` — entire Anthropic provider implementation

#### Core Library

- `packages/core/src/types/enums.ts` — remove `ANTHROPIC` from `AiProvider` enum
- `packages/core/src/ai/types.ts` — remove `ANTHROPIC_MODELS` constant; remove `'anthropic'` from provider union types in `AiConfigSchema` and `AiProviderInterface`
- `packages/core/src/ai/providers/factory.ts` — remove Anthropic case from switch; simplify since only one provider exists
- `packages/core/src/config.ts` — remove `AI_ANTHROPIC_API_KEY` env var validation
- `packages/core/src/ai/batch.ts` — remove `anthropic: 50` from `PROVIDER_RPM` map
- `packages/core/src/rag/ask.ts` — remove Anthropic branch from `createLlmModel()`, always use OpenAI
- `packages/core/src/rag/types.ts` — remove `'anthropic'` from `answerProvider` union; remove the field entirely since it's always OpenAI now

#### Web Package

- `packages/web/src/routes/api/v1/ai/models/+server.ts` — always return `OPENAI_MODELS`, remove Anthropic branch
- `packages/web/src/routes/settings/+page.server.ts` — remove `hasAnthropicKey` flag
- `packages/web/src/routes/settings/+page.svelte`:
  - Remove AI provider radio buttons (lines ~905-937) — no provider choice needed
  - Remove RAG answer provider radio buttons (lines ~1523-1550) — always OpenAI
  - Update reasoning effort `InfoIcon` tooltip to remove Anthropic extended thinking mention
  - Remove `ragAnswerProvider` state and related logic

#### Dependencies

Remove from `packages/core/package.json`:
- `@anthropic-ai/sdk`
- `@ai-sdk/anthropic`

#### Documentation

- `.env.example` — remove `AI_ANTHROPIC_API_KEY`, update RAG comment
- `packages/core/CLAUDE.md` — update AI description to just mention OpenAI
- `README.md` — update classification description to just say OpenAI
- `docs/configuration.md` — remove Anthropic API key rows from both tables
- `docs/architecture.md` — remove Anthropic references from AI description and providers table
- `docs/index.md` — update to just say OpenAI
- `docs/api-reference.md` — update AI config example (remove `"provider": "anthropic"` example), update provider description
- `docs/ai-processing.md` — remove Anthropic model table, Anthropic extraction section, and Anthropic-specific mentions throughout
- `docs/document-qa.md` — remove Anthropic references from generation description, config table, and tips

*Note: `CHANGELOG.md` is historical and should not be edited.*

---

## Part 2: OpenAI Flex Processing

### Configuration

Add to `AiConfigSchema` in `packages/core/src/ai/types.ts`:

```typescript
flexProcessing: z.boolean().default(true),
```

Default is `true` — flex is on by default since AI metadata extraction is not time-sensitive.

### Provider Changes

In `packages/core/src/ai/providers/openai.ts`:

**Client creation:**
- When `flexProcessing: true` — set `timeout: 900_000` (15 minutes, per OpenAI docs recommendation)
- When `flexProcessing: false` — keep `timeout: 60_000` (current behavior)

**Request parameters:**
- When `flexProcessing: true` — add `service_tier: "flex"` to `responses.parse()` call
- When `flexProcessing: false` — add `service_tier: "default"` explicitly

### Plumbing

- `AiProviderInterface` or `createAiProvider()` factory accepts `flexProcessing` and passes it to `OpenAiProvider.create()`
- `OpenAiProvider` stores it as instance state, uses it for client timeout and request `service_tier`
- AI processing worker already reads full `aiConfig` — just needs to pass `flexProcessing` through

### RAG Is Unchanged

Flex processing does NOT apply to:
- `packages/core/src/rag/ask.ts` (streaming answers — user is actively waiting)
- `packages/core/src/rag/embeddings.ts` (embedding generation)

These stay on standard tier with 60s timeout.

### Error Handling

No special handling needed. The existing SDK retry logic (default 10 retries with exponential backoff) handles:
- `429 Resource Unavailable` — flex capacity unavailable, SDK retries automatically
- `408 Request Timeout` — SDK retries automatically (OpenAI docs confirm 2 automatic retries for this)

The circuit breaker already skips rate-limit-style errors, so flex 429s won't trip it.

### UI Changes

In `packages/web/src/routes/settings/+page.svelte`:

Add a toggle/checkbox for "Flex Processing" in the AI processing settings section. Use `RichTooltip` (not plain `InfoIcon`) to include a clickable link:

> "Uses OpenAI's Flex Processing for ~50% lower costs. Requests may take longer or be temporarily unavailable during high demand. Recommended for background processing. [Learn more](https://developers.openai.com/api/docs/guides/flex-processing)"

### Documentation

- `docs/ai-processing.md` — add flex processing section explaining the setting, cost savings, and latency trade-off
- `.env.example` — no change needed (flex is a DB-stored setting, not an env var)

---

## Out of Scope

- Flex processing for RAG (interactive, user-facing)
- Configurable timeout (YAGNI — 15min/60s defaults match OpenAI recommendations)
- Exposing full `service_tier` enum (unnecessary complexity for users)
