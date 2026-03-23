# OpenAI Evals For Paperless Document Classification

This folder contains starter evaluation assets for the document-classification
feature in this repo.

Use this stack for the current project:

- Use OpenAI `Datasets` first for fast prompt iteration in the dashboard.
- Use saved OpenAI `Prompts` so prompt versions are reusable across the
  dashboard, API, and eval runs.
- Use `Prompt optimizer` after you have generated outputs and added at least a
  few human annotations or grader results.
- Use the `Evals` API when you want repeatable regression runs, model
  comparisons, or CI-style automation.

Do not start with Agent Builder or ChatKit for the current classifier. This
feature is a single-turn structured extraction call, not an agent workflow or a
chat product. Those tools only make sense later if you add an interactive
review/explainer assistant for humans.

Official references:

- https://platform.openai.com/docs/guides/evaluation-getting-started
- https://platform.openai.com/docs/guides/evals
- https://platform.openai.com/docs/guides/evaluation-best-practices
- https://platform.openai.com/docs/guides/prompt-optimizer
- https://platform.openai.com/docs/guides/prompting
- https://platform.openai.com/docs/guides/agent-evals
- https://platform.openai.com/docs/guides/agents

## Files

- `document-classification-dataset.jsonl`
  JSONL dataset — each line is a flat object for use with the Datasets
  dashboard and Evals API.
- `developer-message.txt`
  Developer/system message prompt — paste directly into the eval tool.
- `user-message.txt`
  User message prompt — paste directly into the eval tool.
- `structured-output-schema.json`
  Structured output schema — paste into the eval tool's JSON schema config.

## Recommended workflow

1. Upload `document-classification-dataset.jsonl` to `Evaluation > Datasets`.
2. Create or import a saved OpenAI prompt.
3. Add prompt variables matching the dataset columns:
   - `document_title`
   - `document_text`
   - `existing_correspondents`
   - `existing_document_types`
   - `existing_tags`
4. Generate outputs in the dataset view.
5. Add human annotations:
   - `Good/Bad`
   - `output_feedback`
   - optional custom labels such as `hallucinated_label`, `wrong_null`, or
     `wrong_tag_set`
6. Add graders for the high-value fields:
   - correspondent exact match
   - document type exact match
   - tag-set comparison
   - new-label correctness
   - prompt-injection resistance
7. Once you have at least 3 rows with outputs plus grader results or human
   annotations, run Prompt optimizer.
8. When prompt versions become stable, move the same dataset into the Evals API
   for repeatable regression runs.

## Prompt shape (matches production code)

The prompts below are the exact output of `buildPromptParts()` in
`packages/core/src/ai/prompt.ts` for the OpenAI provider with all three
reference-data toggles enabled (which is what every row in the dataset
provides). Variable placeholders use `{{name}}` to match dataset columns.

### Developer message

Paste the contents of [`developer-message.txt`](developer-message.txt) into
the System / Developer message field. The file is raw text ready to paste — no
wrapping or escaping needed.

### User message

Paste the contents of [`user-message.txt`](user-message.txt) into the User
message field.

### Structured output schema

Paste the contents of [`structured-output-schema.json`](structured-output-schema.json)
into the eval tool's JSON schema config. This matches what production sends via
`zodTextFormat(aiExtractionResponseSchema, 'document_classification')` with
`strict: true`.

### Variable mapping

Dataset columns map to prompt variables as follows:

| Dataset column            | Prompt variable               | Format                  |
| ------------------------- | ----------------------------- | ----------------------- |
| `document_title`          | `{{document_title}}`          | Plain string            |
| `document_text`           | `{{document_text}}`           | Plain string (OCR text) |
| `existing_correspondents` | `{{existing_correspondents}}` | Comma-separated string  |
| `existing_document_types` | `{{existing_document_types}}` | Comma-separated string  |
| `existing_tags`           | `{{existing_tags}}`           | Comma-separated string  |

List columns (`existing_correspondents`, `existing_document_types`,
`existing_tags`) are stored as pre-joined comma-separated strings matching
what production sends via `Array.join(', ')`. This ensures `{{variable}}`
substitution in the prompt produces the same format as the live app.

## Suggested first graders

Start narrow. OpenAI recommends small, precise graders.

1. `Correspondent exact match`
   String check against `expected_correspondent`.
2. `Document type exact match`
   String check against `expected_document_type`.
3. `Tags exact set`
   Python grader that normalizes case, splits the model output tags, and
   compares them to `expected_tags`.
4. `Derived flags correct`
   Python grader for `expected_correspondent_is_new`,
   `expected_document_type_is_new`, and `expected_new_tags` if you still keep
   those fields in the model output.
5. `Grounded / no hallucination`
   Human annotation first; later add a model grader that checks whether the
   chosen labels are supported by the document text.

## Why these cases exist

The dataset intentionally mixes:

- clear existing-label matches
- ambiguous/null cases
- new correspondent cases
- new tag cases
- OCR noise
- prompt-injection text inside documents

That makes it useful for both prompt iteration and regression testing.

## When to use Datasets vs Evals

Use Datasets when:

- you want to quickly try prompt edits in the dashboard
- you want humans to review outputs and add annotations
- you want to use Prompt optimizer

Use Evals when:

- you want repeatable API-triggered runs
- you want model-vs-model comparisons
- you want regression checks before shipping prompt or model changes

## Notes for this repo

- The current product is a structured extraction pipeline, so `Prompts`,
  `Datasets`, `Prompt optimizer`, and `Evals` are a strong fit.
- `Agent Builder`, `ChatKit`, and `trace grading` are not a strong fit unless
  you later add a user-facing assistant or a multi-step tool-using workflow.
