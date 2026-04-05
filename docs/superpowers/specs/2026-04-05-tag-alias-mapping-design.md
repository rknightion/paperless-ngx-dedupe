# Tag Alias Mapping

## Problem

The AI metadata extraction feature suggests tags for documents, but the LLM may use variant names for the same concept (e.g. "national-health-service" instead of "nhs", "municipal" instead of "council"). Users need a way to define canonical tag names and their aliases so the LLM normalises its suggestions before returning them.

## Solution

A YAML-based alias map that users can edit in the settings page. The map is injected into the LLM prompt via a template placeholder, instructing the model to replace alias matches with their canonical parent key. The feature is opt-in via a toggle.

## Config & Storage

Two new fields in `aiConfigSchema` (`packages/core/src/ai/types.ts`):

| Field | Type | Default |
|---|---|---|
| `tagAliasesEnabled` | `z.boolean()` | `false` |
| `tagAliasMap` | `z.string()` | `DEFAULT_TAG_ALIAS_MAP` |

Stored in `app_config` as `ai.tagAliasesEnabled` and `ai.tagAliasMap`. No schema migration needed — Zod defaults handle first-read of new keys.

`DEFAULT_TAG_ALIAS_MAP` is a new constant in `types.ts` containing the full default alias YAML block (format: each key is a canonical tag, value is an array of alias strings).

## Prompt Injection

### Template placeholder

Add `{{tag_aliases}}` to `DEFAULT_EXTRACTION_PROMPT` in the tags rules section, accompanied by a short instruction:

> When suggesting tags, consult the alias map below. If a tag you would suggest appears as an alias (listed under a key), use the key instead.

### Resolution in `buildPromptParts()`

`buildPromptParts()` in `packages/core/src/ai/prompt.ts` resolves `{{tag_aliases}}` based on config:

- **Enabled (`tagAliasesEnabled: true`):** Inject the YAML string verbatim, wrapped in a labeled XML block:
  ```
  Tag Alias Map:
  <alias_map>
  {yaml content}
  </alias_map>
  ```
- **Disabled (`tagAliasesEnabled: false`):** Inject `"No tag alias mappings are configured."`

The YAML is not parsed at prompt-build time — it is injected as-is for the LLM to read directly.

### Function signature changes

`buildPromptParts()` receives the alias config (enabled flag + map string). `processDocument()` in `extract.ts` passes these through from the config object.

## Settings UI

In `packages/web/src/routes/settings/+page.svelte`, add a new section within the AI settings area:

### Controls

- **Toggle:** "Enable Tag Alias Mapping" checkbox bound to `tagAliasesEnabled`.
- **Textarea:** YAML editor for the alias map. Only visible/enabled when the toggle is on. Pre-populated with `DEFAULT_TAG_ALIAS_MAP`. Uses the same show/hide expand pattern as the prompt template editor.

### Default diff warning

Same pattern as the prompt template:

- `isDefaultTagAliasMap` boolean computed in `+page.server.ts` via string equality: `config.tagAliasMap === DEFAULT_TAG_ALIAS_MAP`.
- When differs: alert with "Your tag alias map has been customised and differs from the latest recommended default" + "Revert to Default" button.
- Revert sends `tagAliasMap: undefined` via `PUT /api/v1/ai/config`.

### YAML validation

Validate the YAML both client-side (for immediate feedback) and server-side (in the `PUT /api/v1/ai/config` handler, to reject bad data regardless of client):

1. Parse the string as YAML.
2. Check the result is an object where every key maps to an array of strings (`Record<string, string[]>`).
3. If validation fails: client-side shows an inline error on the textarea and prevents the save; server-side returns a 400 with an appropriate error message.

This catches typos, broken indentation, and wrong structure without being overly strict.

## Default Alias Map

The default map contains aliases for common tag variants, organised by domain. The full content is defined in the `DEFAULT_TAG_ALIAS_MAP` constant. Format:

```yaml
uk:
  - united-kingdom
  - united kingdom
  - great-britain
  - great britain
  - britain
  - british
  - uk-based
  - uk-wide
  - england
  - scotland
  - wales
  - northern-ireland

nhs:
  - national-health-service
  - nhs-england
  - nhs trust
  - nhs-hospital
```

(Full map contains ~150 canonical tags with ~750 aliases across scope, lifecycle, travel, property, vehicle, health, employment, finance, legal, government, technology, commercial, business, personal, and education domains.)

## Files to Modify

| File | Change |
|---|---|
| `packages/core/src/ai/types.ts` | Add `DEFAULT_TAG_ALIAS_MAP` constant, add `tagAliasesEnabled` and `tagAliasMap` to `aiConfigSchema`, update `DEFAULT_EXTRACTION_PROMPT` to include `{{tag_aliases}}` placeholder and instruction text |
| `packages/core/src/ai/prompt.ts` | Update `buildPromptParts()` to resolve `{{tag_aliases}}` |
| `packages/core/src/ai/extract.ts` | Pass alias config through to `buildPromptParts()` |
| `packages/core/src/ai/config.ts` | Handle new config keys in `getAiConfig`/`setAiConfig` (may already work via Zod, verify) |
| `packages/core/src/index.ts` | Export `DEFAULT_TAG_ALIAS_MAP` if needed by web package |
| `packages/web/src/routes/settings/+page.server.ts` | Add `isDefaultTagAliasMap` computation |
| `packages/web/src/routes/settings/+page.svelte` | Add toggle, textarea, diff warning, revert button, YAML validation |

## Non-goals

- No YAML parsing at prompt-build time — injected verbatim.
- No validation that alias keys match actual Paperless tags — the LLM uses it as guidance, not a hard constraint.
- No per-entry editing UI — users edit raw YAML.
- No canonical_tags or normalisation_rules sections — these concerns are already handled by the existing prompt and `{{existing_tags}}` reference data.
