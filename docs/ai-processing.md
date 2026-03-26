---
title: AI Processing
description: AI-powered document classification and metadata extraction using LLMs
---

# AI Processing

Paperless NGX Dedupe can use large language models to classify your documents and suggest metadata -- correspondent, document type, and tags -- with per-field confidence scores. Results are stored for review before anything is changed in Paperless-NGX.

## Setup

AI processing is disabled by default. Enable it with two environment variables:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_ENABLED` | No | `false` | Master switch for all AI features |
| `AI_OPENAI_API_KEY` | When using OpenAI | - | OpenAI API key |
| `AI_ANTHROPIC_API_KEY` | When using Anthropic | - | Anthropic API key |

At least one API key is required when `AI_ENABLED=true`. If both keys are provided, the active provider is selected in the Settings page.

## Configuration

After enabling, configure processing behavior in **Settings > AI Processing** or via `PUT /api/v1/ai/config`. All settings are stored in the database and take effect immediately.

| Setting | Default | Range | Description |
| --- | --- | --- | --- |
| `provider` | `openai` | `openai`, `anthropic` | LLM provider to use |
| `model` | `gpt-5.4-mini` | see below | Model identifier |
| `promptTemplate` | built-in | string | Prompt template with placeholders |
| `maxContentLength` | `8000` | 500--100,000 | Max characters of document text sent to the model |
| `batchSize` | `10` | 1--100 | Maximum concurrent AI requests |
| `rateDelayMs` | `0` | 0--60,000 | Delay (ms) between launching requests. 0 = auto-pacing |
| `autoProcess` | `false` | boolean | Auto-start processing after sync |
| `processedTagName` | `ai-processed` | string | Tag name added when suggestions are applied |
| `addProcessedTag` | `false` | boolean | Whether to add the processed tag on apply |
| `includeCorrespondents` | `false` | boolean | Send existing correspondents as reference data |
| `includeDocumentTypes` | `false` | boolean | Send existing document types as reference data |
| `includeTags` | `false` | boolean | Send existing tags as reference data |
| `reasoningEffort` | `low` | `none`, `low`, `medium`, `high` | Reasoning effort for both OpenAI and Anthropic |
| `maxRetries` | `3` | 0--10 | Retry count on transient API failures |
| `confidenceThresholdGlobal` | `0` | 0--1 | Minimum confidence for all fields (floor) |
| `confidenceThresholdCorrespondent` | `0` | 0--1 | Per-field override for correspondent |
| `confidenceThresholdDocumentType` | `0` | 0--1 | Per-field override for document type |
| `confidenceThresholdTags` | `0` | 0--1 | Per-field override for tags |
| `neverAutoCreateEntities` | `false` | boolean | Block suggestions that would create new correspondents, document types, or tags |
| `neverOverwriteNonEmpty` | `false` | boolean | Block suggestions that would overwrite an existing non-empty value |
| `tagsOnlyAutoApply` | `false` | boolean | When auto-applying, only touch tags -- leave correspondent and document type for manual review |
| `autoApplyEnabled` | `false` | boolean | Enable automatic application of high-confidence results after processing |
| `autoApplyRequireAllAboveThreshold` | `true` | boolean | All fields must meet their confidence threshold |
| `autoApplyRequireNoNewEntities` | `true` | boolean | Block auto-apply if new entities would be created |
| `autoApplyRequireNoClearing` | `true` | boolean | Block auto-apply if existing values would be cleared |
| `autoApplyRequireOcrText` | `true` | boolean | Block auto-apply for documents with no OCR text |

### Available Models

=== "OpenAI"

    | Model ID | Name |
    | --- | --- |
    | `gpt-5.4` | GPT-5.4 |
    | `gpt-5.4-mini` | GPT-5.4 Mini |
    | `gpt-5.4-nano` | GPT-5.4 Nano |

=== "Anthropic"

    | Model ID | Name |
    | --- | --- |
    | `claude-opus-4-6` | Claude Opus 4.6 |
    | `claude-sonnet-4-6` | Claude Sonnet 4.6 |
    | `claude-haiku-4-5` | Claude Haiku 4.5 |

## How Processing Works

```mermaid
flowchart LR
    A[Start Batch] --> B[Fetch Reference Data]
    B --> C[For Each Document]
    C --> D[Build Prompt]
    D --> E[Call LLM]
    E --> F[Store Result]
    F --> G{More Docs?}
    G -->|Yes| H[Rate Delay]
    H --> C
    G -->|No| I[Complete]
    style A fill:#e8eaf6,stroke:#3f51b5
    style B fill:#e8eaf6,stroke:#3f51b5
    style C fill:#e8eaf6,stroke:#3f51b5
    style D fill:#e8eaf6,stroke:#3f51b5
    style E fill:#e8eaf6,stroke:#3f51b5
    style F fill:#e8eaf6,stroke:#3f51b5
    style G fill:#e8eaf6,stroke:#3f51b5
    style H fill:#e8eaf6,stroke:#3f51b5
    style I fill:#e8eaf6,stroke:#3f51b5
```

Processing runs as a background job with real-time progress via SSE:

1. **Fetch reference data** -- If the `includeCorrespondents`, `includeDocumentTypes`, or `includeTags` toggles are enabled, the current lists are fetched from Paperless-NGX and included in the prompt so the model can match existing names.

2. **For each document** -- The document's text is truncated to `maxContentLength` (preserving the beginning and end), combined with the prompt template, and sent to the configured provider.

3. **Store result** -- The model's structured response (suggested correspondent, document type, up to 5 tags, and per-field confidence scores) is stored in the database. If processing fails for a document, the error is stored instead.

4. **Rate delay** -- A configurable pause between API calls prevents rate-limit errors.

Documents without text content are skipped automatically. When re-processing, existing results are overwritten.

## Reviewing Results

Open the **AI Processing** page to review suggestions. Each result shows:

- The document title
- Current vs. suggested correspondent, document type, and tags
- Per-field confidence scores (color-coded: green >= 80%, yellow >= 50%, red < 50%)
- An evidence snippet from the document

### Status Lifecycle

Results move through these statuses:

| Status | Meaning |
| --- | --- |
| `pending_review` | Awaiting human review |
| `applied` | All suggested fields applied to Paperless-NGX |
| `partial` | Some fields applied (e.g., only correspondent and tags) |
| `rejected` | Dismissed by user |
| `reverted` | Previously applied result restored to its pre-apply state |
| `failed` | AI extraction failed (see error message for details) |

### Applying Suggestions

When you apply a result:

1. Each suggested name is resolved to its Paperless-NGX ID (case-insensitive match)
2. If a correspondent, document type, or tag does not exist, it is **created automatically** in Paperless-NGX
3. The document is updated via the Paperless-NGX API
4. If `addProcessedTag` is enabled, the configured tag is also added

You can apply all fields at once, or select specific fields for partial application. Batch apply and batch reject are supported for bulk review.

By default, applying a result will not clear existing Paperless-NGX metadata when the AI has no suggestion for a field. Pass `allowClearing: true` in the API to explicitly allow clearing. New entities (correspondents, document types, tags) are created automatically unless `createMissingEntities: false` is specified.

### Reverting Applied Results

Applied or partially applied results can be reverted to restore the document's pre-apply state in Paperless-NGX. Revert uses the audit snapshot recorded at apply time to restore the original correspondent, document type, and tags. Results applied before audit tracking was introduced cannot be reverted.

Revert via the UI or `POST /api/v1/ai/results/:id/revert`.

### Processing Scopes

When starting a batch, you choose which documents to process:

| Scope | Description |
| --- | --- |
| `new_only` | Only documents without an existing AI result (default) |
| `failed_only` | Re-process only documents whose previous run failed |
| `selected_document_ids` | Process a specific set of document IDs |
| `current_filter` | Process documents matching the current filter criteria |
| `full_reprocess` | Re-process every document, overwriting existing results |

### Apply Scopes

When applying results in bulk, you choose which results to target:

| Scope | Description |
| --- | --- |
| `selected_result_ids` | Apply specific result IDs |
| `all_pending` | Apply all results in `pending_review` status |
| `current_filter` | Apply results matching the current filter criteria |

### Preflight Validation

Before applying results in bulk, you can run a preflight check (`POST /api/v1/ai/preflight`) to preview the impact. The preflight report shows:

- How many fields would change per category (correspondent, document type, tags)
- Which new entities would be created
- How many results have low confidence
- How many results are no-ops (already matching)
- How many results would destructively clear existing values
- A confidence distribution breakdown (high/medium/low)
- Gate evaluation results showing how many results would auto-apply vs. be blocked, with reasons

## Confidence Gates and Auto-Apply

### Confidence Gates

Confidence gates control which AI results are eligible for automatic application. Each suggestion's per-field confidence score is checked against configurable thresholds:

- **Global threshold** (`confidenceThresholdGlobal`) -- floor applied to all fields
- **Per-field thresholds** (`confidenceThresholdCorrespondent`, `confidenceThresholdDocumentType`, `confidenceThresholdTags`) -- per-field overrides; the effective threshold is the higher of global and per-field

Additional gates refine eligibility:

- **`neverAutoCreateEntities`** -- blocks any suggestion that would create a new correspondent, document type, or tag
- **`neverOverwriteNonEmpty`** -- blocks any suggestion that would overwrite an existing non-empty value with a different one
- **`tagsOnlyAutoApply`** -- restricts auto-apply to tags only; correspondent and document type are left for manual review

### Auto-Apply

When `autoApplyEnabled` is turned on, results that pass all configured gates are automatically applied to Paperless-NGX after processing completes. Auto-apply is maximally conservative by default -- all four safety requirements are enabled:

| Requirement | Default | Description |
| --- | --- | --- |
| `autoApplyRequireAllAboveThreshold` | `true` | Every field must meet its confidence threshold |
| `autoApplyRequireNoNewEntities` | `true` | No new correspondents, types, or tags may be created |
| `autoApplyRequireNoClearing` | `true` | Existing values may not be cleared |
| `autoApplyRequireOcrText` | `true` | The document must have OCR text |

Auto-apply never passes `allowClearing: true`, so existing metadata is always preserved. Results that fail gate evaluation remain in `pending_review` for manual review.

## Cost Tracking

Per-result cost estimates are computed automatically using pricing data fetched from the LiteLLM public pricing index, which is refreshed every 24 hours. The cost statistics API (`GET /api/v1/ai/costs`) provides:

- Total cost across all AI processing
- Cost broken down by provider and model
- Cost over time (daily aggregation)
- Token usage by provider and model

Use `POST /api/v1/ai/costs/estimate` to estimate the cost of a batch before running it. The estimate uses historical average token counts when available, falling back to conservative defaults.

## Feedback

User actions on AI results are recorded as feedback for auditing and analysis:

- **Rejected** -- result dismissed by user, with an optional reason
- **Partial applied** -- some fields applied, some excluded
- **Corrected** -- user edited the AI's suggestion before applying

The feedback summary (`GET /api/v1/ai/feedback`) shows aggregate statistics including the most frequently rejected fields and common correction patterns. This data can help tune your prompt template and confidence thresholds.

## Provider Implementation Details

=== "OpenAI"

    OpenAI extraction uses the **Responses API** (`responses.parse()`) with Zod-based structured output. This ensures the model returns a valid JSON object matching the extraction schema. The `reasoningEffort` setting controls the effort parameter when supported.

    Key details:

    - Uses `developer` role for the system prompt
    - Structured output via `zodTextFormat`
    - Handles refusal detection and incomplete response detection
    - Reports cached token counts when available

=== "Anthropic"

    Anthropic extraction uses `messages.create()` with `output_config` containing a JSON schema for structured output. Prompt caching is enabled via `cache_control: { type: 'ephemeral' }` on the system prompt.

    Key details:

    - Uses `output_config.format.type = 'json_schema'` for structured output
    - The `reasoningEffort` setting maps to `output_config.effort` for extended thinking
    - Reports cache read and creation token counts

## Prompt Customization

The built-in prompt works well for general document classification. For specialized libraries you can edit the prompt template in Settings.

The template supports these placeholders:

| Placeholder | Replaced With |
| --- | --- |
| `{{existing_correspondents}}` | Comma-separated list of existing correspondent names (when `includeCorrespondents` is enabled) |
| `{{existing_document_types}}` | Comma-separated list of existing document type names (when `includeDocumentTypes` is enabled) |
| `{{existing_tags}}` | Comma-separated list of existing tag names (when `includeTags` is enabled) |

The document title and text content are included automatically in the user prompt (not the system prompt template). They do not need placeholders.

The prompt is automatically formatted for the active provider -- XML tags for Anthropic, markdown sections for OpenAI.

!!! tip "Enable reference data for better matching"
    Turning on `includeCorrespondents`, `includeDocumentTypes`, and `includeTags` helps the model reuse your existing names rather than inventing new ones. This is especially useful for established libraries.

## Tips

!!! info "Best practices"
    - **Start small** -- Process a handful of documents first to verify the prompt produces good results before running a full batch.
    - **Tune `maxContentLength`** -- Lower values reduce cost; higher values give the model more context. 8,000 characters is a good default for most documents.
    - **Use `rateDelayMs`** -- Provider rate limits vary by plan. Increase the delay if you hit 429 errors.
    - **`reasoningEffort`** -- Affects both OpenAI (via reasoning effort parameter) and Anthropic (via extended thinking effort). Higher effort may improve accuracy at the cost of latency and tokens.
    - **Review before applying** -- AI suggestions are not always correct. The confidence scores help prioritize review, but always verify before applying to Paperless-NGX.

## See Also

- [Configuration](configuration.md) -- environment variables and runtime settings
- [API Reference](api-reference.md#ai-processing) -- AI REST API endpoints
- [How It Works](how-it-works.md) -- the deduplication pipeline
