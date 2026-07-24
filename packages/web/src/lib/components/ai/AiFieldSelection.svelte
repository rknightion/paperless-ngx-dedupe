<script lang="ts">
  import type {
    AiFieldSelection,
    AiInboxResultDetail,
    AiResultDetail,
  } from '@paperless-dedupe/core';

  interface Props {
    result: AiResultDetail | AiInboxResultDetail;
    selection: AiFieldSelection;
    extractEnabled: {
      title: boolean;
      correspondent: boolean;
      documentType: boolean;
      tags: boolean;
      customFields: boolean;
      processedTag?: boolean;
    };
    disabled?: boolean;
    onchange: (selection: AiFieldSelection) => void;
  }

  let { result, selection, extractEnabled, disabled = false, onchange }: Props = $props();

  const display = (value: unknown): string => {
    const text = Array.isArray(value) ? value.map(String).join(', ') : String(value ?? '(none)');
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  };

  function toggle(field: keyof Omit<AiFieldSelection, 'customFieldIds'>): void {
    onchange({ ...selection, [field]: !selection[field] });
  }

  function toggleCustomField(fieldId: number): void {
    const ids = selection.customFieldIds.includes(fieldId)
      ? selection.customFieldIds.filter((id) => id !== fieldId)
      : [...selection.customFieldIds, fieldId].sort((a, b) => a - b);
    onchange({ ...selection, customFieldIds: ids });
  }
</script>

<fieldset class="space-y-3" {disabled} aria-describedby="field-selection-help">
  <legend class="text-ink text-sm font-semibold">Choose fields to apply</legend>
  <p id="field-selection-help" class="text-muted text-xs">
    Only checked fields are included in the reviewed plan.
  </p>

  {#if extractEnabled.title && result.suggestedTitle}
    <label class="border-soft grid cursor-pointer gap-1 rounded-lg border p-3">
      <span class="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={selection.title}
          onchange={() => toggle('title')}
          aria-label="Apply title"
        />
        Title
      </span>
      <span class="text-muted text-xs">Current: {display(result.currentTitle)}</span>
      <span class="text-ink text-xs">Suggested: {display(result.suggestedTitle)}</span>
    </label>
  {/if}

  {#if extractEnabled.correspondent && result.suggestedCorrespondent}
    <label class="border-soft grid cursor-pointer gap-1 rounded-lg border p-3">
      <span class="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={selection.correspondent}
          onchange={() => toggle('correspondent')}
          aria-label="Apply correspondent"
        />
        Correspondent
      </span>
      <span class="text-muted text-xs">Current: {display(result.currentCorrespondent)}</span>
      <span class="text-ink text-xs">Suggested: {display(result.suggestedCorrespondent)}</span>
    </label>
  {/if}

  {#if extractEnabled.documentType && result.suggestedDocumentType}
    <label class="border-soft grid cursor-pointer gap-1 rounded-lg border p-3">
      <span class="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={selection.documentType}
          onchange={() => toggle('documentType')}
          aria-label="Apply document type"
        />
        Document type
      </span>
      <span class="text-muted text-xs">Current: {display(result.currentDocumentType)}</span>
      <span class="text-ink text-xs">Suggested: {display(result.suggestedDocumentType)}</span>
    </label>
  {/if}

  {#if extractEnabled.tags && result.suggestedTags.length > 0}
    <label class="border-soft grid cursor-pointer gap-1 rounded-lg border p-3">
      <span class="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={selection.tags}
          onchange={() => toggle('tags')}
          aria-label="Apply tags"
        />
        Tags
      </span>
      <span class="text-muted text-xs">Current: {display(result.currentTags)}</span>
      <span class="text-ink text-xs">Suggested: {display(result.suggestedTags)}</span>
    </label>
  {/if}

  {#if extractEnabled.customFields}
    {#each result.suggestedCustomFields as field (field.fieldId)}
      <label class="border-soft grid cursor-pointer gap-1 rounded-lg border p-3">
        <span class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={selection.customFieldIds.includes(field.fieldId)}
            onchange={() => toggleCustomField(field.fieldId)}
            aria-label={`Apply custom field ${field.fieldName ?? field.fieldId}`}
          />
          {field.fieldName ?? `Custom field #${field.fieldId}`}
        </span>
        <span class="text-muted text-xs">
          Current:
          {display(result.currentCustomFields.find((item) => item.field === field.fieldId)?.value)}
        </span>
        <span class="text-ink text-xs">Suggested: {display(field.value)}</span>
      </label>
    {/each}
  {/if}

  {#if extractEnabled.processedTag}
    <label class="border-soft flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
      <input
        type="checkbox"
        checked={selection.processedTag}
        onchange={() => toggle('processedTag')}
        aria-label="Add processed tag"
      />
      <span>
        <span class="text-ink block font-medium">Add AI processed tag</span>
        <span class="text-muted text-xs"
          >Optional operational marker; never added automatically.</span
        >
      </span>
    </label>
  {/if}
</fieldset>
