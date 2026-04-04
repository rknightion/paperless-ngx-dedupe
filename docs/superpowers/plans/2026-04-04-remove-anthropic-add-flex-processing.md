# Remove Anthropic & Add Flex Processing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Anthropic API support and add OpenAI flex processing with ~50% cost savings for background AI metadata extraction.

**Architecture:** Two independent changes sharing a branch. Part 1 deletes the Anthropic provider, simplifies the factory/config/UI to OpenAI-only. Part 2 adds a `flexProcessing` boolean to AI config, threads it through to the OpenAI provider, and adjusts timeout + `service_tier` accordingly.

**Tech Stack:** TypeScript, SvelteKit 2 (Svelte 5 runes), Drizzle ORM, Zod, OpenAI SDK v6, Vitest

---

### Task 1: Remove Anthropic provider and simplify factory

**Files:**
- Delete: `packages/core/src/ai/providers/anthropic.ts`
- Modify: `packages/core/src/ai/providers/factory.ts`
- Modify: `packages/core/src/ai/providers/types.ts:34-35`
- Modify: `packages/core/src/types/enums.ts:36-40`
- Modify: `packages/core/src/ai/types.ts:115-119,122`
- Modify: `packages/core/src/index.ts:266-267`
- Test: `packages/core/src/ai/__tests__/factory.test.ts`

- [ ] **Step 1: Delete the Anthropic provider file**

Delete `packages/core/src/ai/providers/anthropic.ts` entirely.

- [ ] **Step 2: Simplify the factory to OpenAI-only**

Replace the contents of `packages/core/src/ai/providers/factory.ts` with:

```typescript
import type { AiProviderInterface } from './types.js';
import { OpenAiProvider } from './openai.js';

export async function createAiProvider(
  apiKey: string,
  model: string,
  maxRetries = 3,
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(apiKey, model, maxRetries);
}
```

Note: The `provider` parameter is removed. `flexProcessing` will be added in Task 5 when the OpenAI provider is updated to accept it.

- [ ] **Step 3: Simplify the provider interface**

In `packages/core/src/ai/providers/types.ts`, change line 34-35 from:

```typescript
export interface AiProviderInterface {
  readonly provider: 'openai' | 'anthropic';
```

to:

```typescript
export interface AiProviderInterface {
  readonly provider: 'openai';
```

- [ ] **Step 4: Remove ANTHROPIC from AiProvider enum**

In `packages/core/src/types/enums.ts`, change lines 36-40 from:

```typescript
export const AiProvider = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
} as const;
```

to:

```typescript
export const AiProvider = {
  OPENAI: 'openai',
} as const;
```

- [ ] **Step 5: Remove ANTHROPIC_MODELS and simplify provider union in aiConfigSchema**

In `packages/core/src/ai/types.ts`:

Remove lines 115-119 (the `ANTHROPIC_MODELS` constant) entirely.

Change line 122 from:

```typescript
  provider: z.enum(['openai', 'anthropic']).default('openai'),
```

to:

```typescript
  provider: z.literal('openai').default('openai'),
```

- [ ] **Step 6: Remove ANTHROPIC_MODELS export from index.ts**

In `packages/core/src/index.ts`, change line 266-267 from:

```typescript
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
```

to:

```typescript
  OPENAI_MODELS,
```

- [ ] **Step 7: Update factory tests**

Replace the contents of `packages/core/src/ai/__tests__/factory.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiProvider } from '../providers/factory.js';

// Mock the actual provider module to avoid requiring real SDK installation
vi.mock('../providers/openai.js', () => ({
  OpenAiProvider: {
    create: vi.fn().mockResolvedValue({
      provider: 'openai',
      extract: vi.fn(),
    }),
  },
}));

describe('createAiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OpenAI provider', async () => {
    const provider = await createAiProvider('sk-test-key', 'gpt-5.4-mini');
    expect(provider.provider).toBe('openai');
  });

  it('passes maxRetries to provider constructor', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 5);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5);
  });
});
```

- [ ] **Step 8: Run tests to verify**

Run: `pnpm --filter @paperless-dedupe/core test -- --run packages/core/src/ai/__tests__/factory.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor(ai): remove Anthropic provider and simplify factory to OpenAI-only"
```

---

### Task 2: Remove Anthropic from config, batch, prompt, costs, and extract

**Files:**
- Modify: `packages/core/src/config.ts:27,54`
- Modify: `packages/core/src/ai/batch.ts:28`
- Modify: `packages/core/src/ai/prompt.ts:16,25,67-74`
- Modify: `packages/core/src/ai/costs.ts:6,42,99-102`
- Modify: `packages/core/src/ai/cost-estimate.ts:6,14,43-44,61,203-217`
- Modify: `packages/core/src/ai/extract.ts:37`
- Modify: `packages/core/src/jobs/workers/ai-processing-worker.ts:23-25,30-35`
- Test: `packages/core/src/ai/__tests__/batch.test.ts`
- Test: `packages/core/src/ai/__tests__/prompt.test.ts`
- Test: `packages/core/src/ai/__tests__/extract.test.ts`

- [ ] **Step 1: Remove AI_ANTHROPIC_API_KEY from config.ts**

In `packages/core/src/config.ts`, remove line 27:

```typescript
    AI_ANTHROPIC_API_KEY: z.string().optional(),
```

And change the AI_ENABLED refinement (line 54) from:

```typescript
  .refine((data) => !data.AI_ENABLED || data.AI_OPENAI_API_KEY || data.AI_ANTHROPIC_API_KEY, {
    error:
      'When AI_ENABLED=true, at least one AI API key is required: AI_OPENAI_API_KEY or AI_ANTHROPIC_API_KEY',
    path: ['AI_ENABLED'],
  })
```

to:

```typescript
  .refine((data) => !data.AI_ENABLED || data.AI_OPENAI_API_KEY, {
    error: 'When AI_ENABLED=true, AI_OPENAI_API_KEY is required',
    path: ['AI_ENABLED'],
  })
```

- [ ] **Step 2: Remove Anthropic from PROVIDER_RPM in batch.ts**

In `packages/core/src/ai/batch.ts`, change lines 26-29 from:

```typescript
const PROVIDER_RPM: Record<string, number> = {
  openai: 5_000,
  anthropic: 50,
};
```

to:

```typescript
const PROVIDER_RPM: Record<string, number> = {
  openai: 5_000,
};
```

- [ ] **Step 3: Simplify prompt.ts — remove Anthropic XML wrapping**

In `packages/core/src/ai/prompt.ts`:

Remove the `provider` field from `BuildPromptOptions` (line 16):

```typescript
  provider?: 'openai' | 'anthropic';
```

Remove the `provider` destructuring in `buildPromptParts` (line 43). Then replace lines 67-75 (the Anthropic-specific XML wrapping logic) with just the OpenAI format:

```typescript
  const userPrompt = `Document Title\n${documentTitle}\n\nDocument Text\n${documentContent}`;

  return { systemPrompt, userPrompt };
```

The entire `isAnthropic` conditional block and XML wrapping should be removed.

- [ ] **Step 4: Remove provider param from extract.ts**

In `packages/core/src/ai/extract.ts`, remove `provider: options.provider.provider` from the `buildPromptParts` call (line 37). The call should just be:

```typescript
  const { systemPrompt, userPrompt } = buildPromptParts({
    promptTemplate: options.promptTemplate,
    documentTitle: options.documentTitle,
    documentContent: truncatedContent,
    existingCorrespondents: options.existingCorrespondents,
    existingDocumentTypes: options.existingDocumentTypes,
    existingTags: options.existingTags,
    includeCorrespondents: options.includeCorrespondents,
    includeDocumentTypes: options.includeDocumentTypes,
    includeTags: options.includeTags,
  });
```

- [ ] **Step 5: Simplify AI processing worker — remove Anthropic key selection**

In `packages/core/src/jobs/workers/ai-processing-worker.ts`, replace lines 23-35 (the API key selection and provider creation) with:

```typescript
  const apiKey = config.AI_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('No OpenAI API key configured (AI_OPENAI_API_KEY)');
  }

  const provider = await createAiProvider(
    apiKey,
    aiConfig.model,
    aiConfig.maxRetries,
  );
```

This removes the `aiConfig.provider === 'openai'` conditional and always uses the OpenAI key. The `flexProcessing` param will be threaded through in Task 5.

- [ ] **Step 6: Simplify costs.ts**

In `packages/core/src/ai/costs.ts`:

Change line 6 from:

```typescript
import { OPENAI_MODELS, ANTHROPIC_MODELS } from './types.js';
```

to:

```typescript
import { OPENAI_MODELS } from './types.js';
```

Change `getKnownModelIds()` (line 42) from:

```typescript
  return [...OPENAI_MODELS.map((m) => m.id), ...ANTHROPIC_MODELS.map((m) => m.id)];
```

to:

```typescript
  return OPENAI_MODELS.map((m) => m.id);
```

Simplify the provider prefix logic in `fetchAndCachePricing` (around lines 99-102). Replace:

```typescript
      const isOpenai = OPENAI_MODELS.some((m) => m.id === modelId);
      const providerSlash = isOpenai ? 'openai/' : 'anthropic/';
      const providerDot = isOpenai ? 'openai.' : 'anthropic.';
```

with:

```typescript
      const providerSlash = 'openai/';
      const providerDot = 'openai.';
```

Remove the comment about LiteLLM `anthropic.` prefix on line 99.

Simplify `getModelPricing` fallback logic (around lines 231-236). Replace:

```typescript
  const isOpenai = OPENAI_MODELS.some((m) => m.id === model);
  const isAnthropic = ANTHROPIC_MODELS.some((m) => m.id === model);
  const familyIds = isOpenai
    ? OPENAI_MODELS.map((m) => m.id)
    : isAnthropic
      ? ANTHROPIC_MODELS.map((m) => m.id)
      : [];
```

with:

```typescript
  const familyIds = OPENAI_MODELS.some((m) => m.id === model)
    ? OPENAI_MODELS.map((m) => m.id)
    : [];
```

- [ ] **Step 7: Simplify cost-estimate.ts**

In `packages/core/src/ai/cost-estimate.ts`:

Change line 6 from:

```typescript
import { OPENAI_MODELS, ANTHROPIC_MODELS } from './types.js';
```

to:

```typescript
import { OPENAI_MODELS } from './types.js';
```

In `ModelCostEstimate` interface (line 14), change:

```typescript
  provider: 'openai' | 'anthropic';
```

to:

```typescript
  provider: 'openai';
```

Remove the comment about Anthropic tokenizer (line 43-44). Since the function only handles OpenAI now, simplify `getTiktokenModel` to:

```typescript
function getTiktokenModel(_modelId: string): string {
  return 'gpt-4o'; // o200k_base encoding, closest match for GPT-5.4 family
}
```

In `computeModelEstimate` signature (line 61), change:

```typescript
  provider: 'openai' | 'anthropic',
```

to:

```typescript
  provider: 'openai',
```

Remove the provider param from `buildPromptParts` call (line 152):

```typescript
    provider: config.provider,
```

Remove the entire Anthropic model loop at lines 203-217:

```typescript
  for (const model of ANTHROPIC_MODELS) {
    const pricing = pricingMap[model.id];
    if (!pricing) continue;
    allModels.push(
      computeModelEstimate(
        model.id,
        model.name,
        'anthropic',
        pricing,
        systemPromptTokens,
        totalUserPromptTokens,
        avgCompletionTokens,
        documentCount,
      ),
    );
  }
```

- [ ] **Step 8: Update Anthropic-referencing tests**

In `packages/core/src/ai/__tests__/batch.test.ts`:

Remove the test at line 392 ("auto-calculates interval for Anthropic at 85% of 50 RPM") and the test at line 400 (explicit override for Anthropic). Also update `provider` type in the mock helper at line 51 from `'openai' | 'anthropic'` to `'openai'`.

In `packages/core/src/ai/__tests__/prompt.test.ts`:

Remove the test at line 52 ("wraps system prompt in XML tags for Anthropic provider").

In `packages/core/src/ai/__tests__/extract.test.ts`:

At line 100, change `provider: 'anthropic'` to `provider: 'openai'` (this test is checking prompt building, not provider-specific behavior). Remove or update the assertion at line 116 about Anthropic XML-wrapped prompts.

In `packages/core/src/ai/__tests__/config.test.ts`:

Change all occurrences of `provider: 'anthropic'` to `provider: 'openai'` and update corresponding model values from `'claude-sonnet-4-6'` to `'gpt-5.4-mini'`.

In `packages/core/src/ai/__tests__/queries.test.ts`:

Change `provider: 'anthropic'` at line 95 to `provider: 'openai'`. Update the filter test at line 328 from `provider: 'anthropic'` to `provider: 'openai'` and update the assertion accordingly.

In `packages/core/src/ai/__tests__/grouping.test.ts`:

Change `provider: 'anthropic'` at line 85 to `provider: 'openai'`.

In `packages/core/src/ai/__tests__/scopes.test.ts`:

Change `provider: 'anthropic'` at line 77 to `provider: 'openai'`.

In `packages/core/src/ai/__tests__/eval.test.ts`:

Remove the Anthropic-specific branches at lines 177-179 (the `AI_ANTHROPIC_API_KEY` check and model selection). Simplify to only support OpenAI. Update the type at line 194 from `'openai' | 'anthropic'` to `'openai'`.

- [ ] **Step 9: Run all core tests**

Run: `pnpm --filter @paperless-dedupe/core test`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor(ai): remove Anthropic references from config, batch, prompt, costs, and tests"
```

---

### Task 3: Remove Anthropic from RAG

**Files:**
- Modify: `packages/core/src/rag/ask.ts:3,10-11,15-16,40-48`
- Modify: `packages/core/src/rag/types.ts:36`
- Test: `packages/core/src/rag/__tests__/ask.test.ts`

- [ ] **Step 1: Simplify RAG ask.ts to OpenAI-only**

Replace the contents of `packages/core/src/rag/ask.ts` with the following. Key changes: remove `createAnthropic` import, remove `anthropicApiKey` from `AskOptions`, simplify `createLlmModel` to always use OpenAI:

```typescript
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import { hybridSearch } from './search.js';
import { createConversation, addMessage, getConversationMessages } from './conversations.js';
import type { RagConfig, SearchResult, RagSource } from './types.js';

interface AskOptions {
  question: string;
  conversationId?: string;
  config: RagConfig;
  openaiApiKey: string;
}

export interface AskResult {
  streamResult: ReturnType<typeof streamText>;
  conversationId: string;
  sources: RagSource[];
  saveResponse: (text: string, totalTokens?: number) => void;
}

function buildContext(results: SearchResult[], maxTokens: number): string {
  const parts: string[] = [];
  let tokenBudget = maxTokens;

  for (const result of results) {
    const approxTokens = Math.ceil(result.chunkContent.length / 4);
    if (approxTokens > tokenBudget) break;
    tokenBudget -= approxTokens;

    parts.push(`--- Document: ${result.documentTitle} ---\n${result.chunkContent}`);
  }

  return parts.join('\n\n');
}

function createLlmModel(config: RagConfig, openaiApiKey: string) {
  const openai = createOpenAI({ apiKey: openaiApiKey });
  return openai(config.answerModel);
}

export async function askDocuments(
  db: AppDatabase,
  sqlite: Database.Database,
  opts: AskOptions,
): Promise<AskResult> {
  // Retrieve relevant chunks
  const searchResults = await hybridSearch(
    sqlite,
    db,
    opts.question,
    opts.config,
    opts.openaiApiKey,
  );

  const sources: RagSource[] = searchResults.map((r) => ({
    documentId: r.documentId,
    title: r.documentTitle,
    chunkContent: r.chunkContent,
    score: r.score,
  }));

  // Build context from search results
  const context = buildContext(searchResults, opts.config.maxContextTokens);

  // Get or create conversation
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const conversation = createConversation(db, opts.question.slice(0, 80));
    conversationId = conversation.id;
  }

  // Load conversation history for multi-turn
  const history = getConversationMessages(db, conversationId);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current question with context
  const userPrompt = context
    ? `Context from your documents:\n${context}\n\nQuestion: ${opts.question}`
    : opts.question;
  messages.push({ role: 'user', content: userPrompt });

  // Save user message
  addMessage(db, conversationId, 'user', opts.question, JSON.stringify(sources));

  // Stream LLM response
  const model = createLlmModel(opts.config, opts.openaiApiKey);
  const streamResult = streamText({
    model,
    system: opts.config.systemPrompt,
    messages,
  });

  // Provide a callback to save the assistant response after streaming completes
  const saveResponse = (text: string, totalTokens?: number) => {
    addMessage(db, conversationId, 'assistant', text, undefined, totalTokens);
  };

  return { streamResult, conversationId, sources, saveResponse };
}
```

- [ ] **Step 2: Remove answerProvider from RAG config schema**

In `packages/core/src/rag/types.ts`, remove line 36:

```typescript
  answerProvider: z.enum(['openai', 'anthropic']).default('openai'),
```

The `answerModel` field stays — it's still needed to select which OpenAI model to use.

- [ ] **Step 3: Update RAG ask test**

In `packages/core/src/rag/__tests__/ask.test.ts`:

Remove the Anthropic mock at lines 24-26:

```typescript
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'anthropic-model')),
}));
```

Remove the test at lines 112-120 ("throws when anthropic provider but no anthropic API key").

- [ ] **Step 4: Run RAG tests**

Run: `pnpm --filter @paperless-dedupe/core test -- --run packages/core/src/rag/__tests__/ask.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(rag): remove Anthropic provider support, always use OpenAI"
```

---

### Task 4: Remove Anthropic from web package

**Files:**
- Modify: `packages/web/src/routes/settings/+page.server.ts:32`
- Modify: `packages/web/src/routes/settings/+page.svelte:66,132,283-298,301-358,360-374,376-407,905-937,954-976,1522-1564`
- Modify: `packages/web/src/routes/api/v1/ai/models/+server.ts`
- Modify: `packages/web/src/routes/api/v1/rag/ask/+server.ts:33`
- Modify: `packages/web/package.json` (remove Anthropic deps)

- [ ] **Step 1: Simplify AI models endpoint**

Replace `packages/web/src/routes/api/v1/ai/models/+server.ts` with:

```typescript
import { apiSuccess } from '$lib/server/api';
import { OPENAI_MODELS } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return apiSuccess(OPENAI_MODELS);
};
```

- [ ] **Step 2: Remove hasAnthropicKey from page.server.ts**

In `packages/web/src/routes/settings/+page.server.ts`, remove line 32:

```typescript
    hasAnthropicKey: !!locals.config.AI_ANTHROPIC_API_KEY,
```

- [ ] **Step 3: Remove anthropicApiKey from RAG ask endpoint**

In `packages/web/src/routes/api/v1/rag/ask/+server.ts`, remove line 33:

```typescript
      anthropicApiKey: locals.config.AI_ANTHROPIC_API_KEY,
```

- [ ] **Step 4: Remove Anthropic state and UI from settings page**

In `packages/web/src/routes/settings/+page.svelte`:

**Script section changes:**

Remove `aiProvider` state (line 66) — it's always `'openai'` now.

Remove `ragAnswerProvider` state (line 132) — it's always `'openai'` now.

Simplify `fetchAiModels` (line 283-293) — remove the provider parameter:

```typescript
  async function fetchAiModels() {
    try {
      const res = await fetch('/api/v1/ai/models');
      const json = await res.json();
      if (res.ok) {
        aiModels = json.data ?? [];
      }
    } catch {
      aiModels = [];
    }
  }
```

Update the `$effect` at lines 295-299 to remove the `aiProvider` dependency:

```typescript
  $effect(() => {
    if (data.aiEnabled) {
      fetchAiModels();
    }
  });
```

In `saveAiConfig()` (lines 301-358), remove `provider: aiProvider` from the JSON body (line 309).

Simplify `fetchRagModels` (lines 360-368) — remove the provider parameter:

```typescript
  async function fetchRagModels() {
    try {
      const res = await fetch('/api/v1/ai/models');
      const json = await res.json();
      if (res.ok) ragModels = json.data ?? [];
    } catch {
      ragModels = [];
    }
  }
```

Update the `$effect` at lines 370-374:

```typescript
  $effect(() => {
    if (data.ragEnabled) {
      fetchRagModels();
    }
  });
```

In `saveRagConfig()` (lines 376-407), remove `answerProvider: ragAnswerProvider` from the JSON body (line 389).

**Template section changes:**

Remove the entire "Provider Selection" block (lines 905-938) — the radio buttons for AI Provider. Keep the "Model Selection" div that follows it.

Update the Reasoning Effort InfoIcon text (line 962) from:

```
"Controls how much the model reasons before answering. For OpenAI, this sets the reasoning effort parameter. For Anthropic, this enables extended thinking mode. 'Low' (default) is recommended — fast and cost-effective for classification. Higher levels increase thinking tokens which are billed as output tokens, potentially doubling costs at 'High'. 'None' disables reasoning/thinking entirely."
```

to:

```
"Controls how much the model reasons before answering. 'Low' (default) is recommended — fast and cost-effective for classification. Higher levels increase thinking tokens which are billed as output tokens, potentially doubling costs at 'High'. 'None' disables reasoning entirely."
```

Remove the entire RAG "Answer Model" provider radio buttons section (lines 1523-1550) — keep only the model select dropdown. The provider label and radio buttons should be removed; the model dropdown can be promoted to the `<h3>` section directly.

- [ ] **Step 5: Remove Anthropic dependencies from web package.json**

In `packages/web/package.json`, remove these two lines from `dependencies`:

```json
    "@ai-sdk/anthropic": "^3.0.63",
    "@anthropic-ai/sdk": "^0.82.0",
```

- [ ] **Step 6: Remove Anthropic peer dependencies from core package.json**

In `packages/core/package.json`, remove from `peerDependencies`:

```json
    "@ai-sdk/anthropic": "^3.0.0",
    "@anthropic-ai/sdk": "^0.79.0 || ^0.80.0 || ^0.81.0 || ^0.82.0",
```

And remove from `peerDependenciesMeta`:

```json
    "@anthropic-ai/sdk": {
      "optional": true
    },
    "@ai-sdk/anthropic": {
      "optional": true
    },
```

- [ ] **Step 7: Run pnpm install to update lockfile**

Run: `pnpm install`
Expected: lockfile updates, no errors

- [ ] **Step 8: Run type-check and build**

Run: `pnpm check && pnpm build`
Expected: PASS with zero errors

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor(web): remove Anthropic from UI, endpoints, and dependencies"
```

---

### Task 5: Add flex processing to OpenAI provider

**Files:**
- Modify: `packages/core/src/ai/providers/openai.ts`
- Modify: `packages/core/src/ai/providers/factory.ts`
- Modify: `packages/core/src/ai/types.ts:121-166`
- Modify: `packages/core/src/jobs/workers/ai-processing-worker.ts`
- Test: `packages/core/src/ai/__tests__/factory.test.ts`

- [ ] **Step 1: Add flexProcessing to AiConfigSchema**

In `packages/core/src/ai/types.ts`, add `flexProcessing` to the schema after the `maxRetries` field (line 135):

```typescript
  flexProcessing: z.boolean().default(true),
```

- [ ] **Step 2: Add flexProcessing to factory**

Update `packages/core/src/ai/providers/factory.ts` to pass `flexProcessing` through:

```typescript
import type { AiProviderInterface } from './types.js';
import { OpenAiProvider } from './openai.js';

export async function createAiProvider(
  apiKey: string,
  model: string,
  maxRetries = 3,
  flexProcessing = true,
): Promise<AiProviderInterface> {
  return OpenAiProvider.create(apiKey, model, maxRetries, flexProcessing);
}
```

- [ ] **Step 3: Update OpenAiProvider to accept and use flexProcessing**

Replace `packages/core/src/ai/providers/openai.ts` with:

```typescript
import type {
  AiProviderInterface,
  AiExtractionRequest,
  AiExtractionResult,
  AiExtractionResponse,
} from './types.js';
import { AiExtractionError, aiExtractionResponseSchema } from './types.js';

export class OpenAiProvider implements AiProviderInterface {
  readonly provider = 'openai' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private model: string;
  private flexProcessing: boolean;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(client: any, model: string, flexProcessing: boolean) {
    this.client = client;
    this.model = model;
    this.flexProcessing = flexProcessing;
  }

  static async create(
    apiKey: string,
    model: string,
    maxRetries = 3,
    flexProcessing = true,
  ): Promise<OpenAiProvider> {
    try {
      const { default: OpenAI } = await import('openai');
      const timeout = flexProcessing ? 900_000 : 60_000;
      const client = new OpenAI({ apiKey, maxRetries, timeout });
      return new OpenAiProvider(client, model, flexProcessing);
    } catch {
      throw new Error('OpenAI SDK not installed. Install it with: pnpm add openai');
    }
  }

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
      service_tier: this.flexProcessing ? 'flex' : 'default',
    };

    if (request.reasoningEffort && request.reasoningEffort !== 'none') {
      params.reasoning = { effort: request.reasoningEffort };
    }

    const response = await this.client.responses.parse(params);

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
      };
    } catch (error) {
      throw new AiExtractionError(
        'schema_mismatch',
        `Schema validation failed: ${(error as Error).message}`,
        response.id,
      );
    }
  }
}
```

Key changes from the original:
- `flexProcessing` added to constructor and `create` method
- Timeout is `900_000` (15 min) when flex is on, `60_000` (1 min) when off
- `service_tier: this.flexProcessing ? 'flex' : 'default'` added to request params

- [ ] **Step 4: Thread flexProcessing through the AI processing worker**

In `packages/core/src/jobs/workers/ai-processing-worker.ts`, update the `createAiProvider` call to pass `flexProcessing`. The call (already simplified in Task 2) should become:

```typescript
  const provider = await createAiProvider(
    apiKey,
    aiConfig.model,
    aiConfig.maxRetries,
    aiConfig.flexProcessing,
  );
```

- [ ] **Step 5: Update factory test for flexProcessing**

In `packages/core/src/ai/__tests__/factory.test.ts`, add tests for the new parameter:

```typescript
  it('passes maxRetries and flexProcessing to provider constructor', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 5, false);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 5, false);
  });

  it('defaults flexProcessing to true', async () => {
    const { OpenAiProvider } = await import('../providers/openai.js');
    await createAiProvider('sk-test-key', 'gpt-5.4-mini', 3);
    expect(OpenAiProvider.create).toHaveBeenCalledWith('sk-test-key', 'gpt-5.4-mini', 3, true);
  });
```

- [ ] **Step 6: Run tests and type-check**

Run: `pnpm check && pnpm --filter @paperless-dedupe/core test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(ai): add flex processing support — ~50% cost reduction for background extraction"
```

---

### Task 6: Add flex processing toggle to UI

**Files:**
- Modify: `packages/web/src/routes/settings/+page.svelte`

- [ ] **Step 1: Add flexProcessing state variable**

In the script section of `packages/web/src/routes/settings/+page.svelte`, add after the `aiMaxRetries` state (around line 81):

```typescript
  let aiFlexProcessing = $state(initialAiConfig?.flexProcessing ?? true);
```

- [ ] **Step 2: Add flexProcessing to saveAiConfig body**

In the `saveAiConfig` function's `JSON.stringify` body, add `flexProcessing: aiFlexProcessing` alongside the other fields (after `maxRetries: aiMaxRetries`).

- [ ] **Step 3: Add the flex processing toggle to the template**

Add a flex processing toggle in the AI Processing settings section, after the Reasoning Effort dropdown (after line ~976) and before the Auto-Process section. Use `RichTooltip` for the info tooltip since it needs a clickable link:

```svelte
      <!-- Flex Processing -->
      <div class="mt-4 flex items-center gap-2">
        <label class="text-muted flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={aiFlexProcessing} class="rounded" />
          Flex Processing
        </label>
        <RichTooltip position="bottom">
          {#snippet children()}
            <svg
              class="text-muted hover:text-accent inline-block h-4 w-4 shrink-0 cursor-help transition-colors"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clip-rule="evenodd"
              />
            </svg>
          {/snippet}
          {#snippet content()}
            Uses OpenAI's Flex Processing for ~50% lower costs. Requests may take longer or be temporarily unavailable during high demand. Recommended for background processing.
            <a
              href="https://developers.openai.com/api/docs/guides/flex-processing"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-300 underline hover:text-blue-200"
            >Learn more</a>
          {/snippet}
        </RichTooltip>
      </div>
```

Make sure `RichTooltip` is imported. Check if it's already imported — the components index exports it, but the settings page may only import `InfoIcon`. If needed, add `RichTooltip` to the imports from `$lib/components`.

- [ ] **Step 4: Run type-check and build**

Run: `pnpm check && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): add flex processing toggle with tooltip to AI settings"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `.env.example`
- Modify: `packages/core/CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/configuration.md`
- Modify: `docs/architecture.md`
- Modify: `docs/index.md`
- Modify: `docs/api-reference.md`
- Modify: `docs/ai-processing.md`
- Modify: `docs/document-qa.md`

- [ ] **Step 1: Update .env.example**

Change lines 24-26 from:

```
# Provider API keys (at least one required when AI_ENABLED=true)
# AI_OPENAI_API_KEY=sk-...
# AI_ANTHROPIC_API_KEY=sk-ant-...
```

to:

```
# OpenAI API key (required when AI_ENABLED=true)
# AI_OPENAI_API_KEY=sk-...
```

Change lines 30-32 from:

```
# Requires AI_OPENAI_API_KEY for generating embeddings (always uses OpenAI).
# The answer model can use either OpenAI or Anthropic (configured in Settings).
# RAG_ENABLED=false
```

to:

```
# Requires AI_OPENAI_API_KEY for embeddings and answer generation.
# RAG_ENABLED=false
```

- [ ] **Step 2: Update packages/core/CLAUDE.md**

Change line 14 from:

```
- **ai** — AI-powered duplicate analysis (OpenAI + Anthropic providers, batch processing, auto-apply)
```

to:

```
- **ai** — AI-powered metadata extraction (OpenAI provider, batch processing, flex processing, auto-apply)
```

- [ ] **Step 3: Update remaining docs**

In each of these files, remove Anthropic references and add flex processing info where appropriate:

**`README.md`** (line 15): Change "using OpenAI or Anthropic models" to "using OpenAI models".

**`docs/configuration.md`**: Remove the two `AI_ANTHROPIC_API_KEY` rows from the configuration tables (lines 52 and 62).

**`docs/architecture.md`** (line 43): Change "OpenAI, Anthropic" to "OpenAI" in the AI module description. (Line 70): Change the AI Providers table row from "OpenAI + Anthropic (via Vercel AI SDK)" to "OpenAI (via Vercel AI SDK)".

**`docs/index.md`** (line 23): Change "using OpenAI or Anthropic models" to "using OpenAI models".

**`docs/api-reference.md`** (lines 460-461): Change the example AI config from `"provider": "anthropic", "model": "claude-sonnet-4-6"` to `"provider": "openai", "model": "gpt-5.4-mini"`. (Line 474): Change `"provider": openai or anthropic (required)` to `"provider": openai (required)`.

**`docs/ai-processing.md`**:
- (Line 18): Remove the `AI_ANTHROPIC_API_KEY` row from the env var table.
- (Line 28): Change provider options from `openai, anthropic` to `openai`.
- Add a new row to the config table for `flexProcessing`: `boolean`, default `true`, description "Use OpenAI Flex Processing for ~50% lower costs".
- (Lines 65-71): Remove the entire "Anthropic" tab/section with the Anthropic model table.
- (Lines 246-248): Remove the "Anthropic" extraction section.
- (Line 270): Remove the sentence about XML tags for Anthropic.
- (Line 281): Simplify the reasoning effort bullet to remove the Anthropic mention.

**`docs/document-qa.md`**:
- (Line 40): Change "sent to your configured LLM (OpenAI or Anthropic)" to "sent to your configured OpenAI model".
- (Line 60): Remove the `AI_ANTHROPIC_API_KEY` row.
- (Line 105): Remove the `answerProvider` config row (or change to note it's always OpenAI).
- (Line 180): Remove the suggestion to consider `claude-sonnet-4-6`.

- [ ] **Step 4: Run lint and format**

Run: `pnpm lint:fix && pnpm format:fix`
Expected: Clean output

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: remove Anthropic references and document flex processing"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full build and test suite**

Run: `pnpm lint && pnpm format && pnpm check && pnpm test`
Expected: All PASS

- [ ] **Step 2: Verify no stale Anthropic references in source code**

Run a grep for any remaining Anthropic references (excluding CHANGELOG.md, node_modules, and .git):

```bash
grep -ri "anthropic" --include="*.ts" --include="*.svelte" --include="*.json" --include="*.md" --include="*.example" -l | grep -v node_modules | grep -v CHANGELOG | grep -v docs/superpowers
```

Expected: No results (or only CHANGELOG.md which is historical).

- [ ] **Step 3: Verify flex processing is in the schema**

Run: `grep -n "flexProcessing" packages/core/src/ai/types.ts`
Expected: Shows the `flexProcessing` field in the schema.

- [ ] **Step 4: Commit any remaining fixes if needed**

If any lint/format/type issues were found and fixed:

```bash
git add -A && git commit -m "chore: fix lint and type-check issues from Anthropic removal"
```
