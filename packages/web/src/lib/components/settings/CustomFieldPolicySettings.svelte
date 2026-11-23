<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Checkbox, TextField } from '$lib/components';
  import {
    createCustomFieldSelections,
    isCustomFieldSelectionDisabled,
    serializeCustomFieldSelections,
    staleCustomFieldPolicyEntries,
    toggleCustomFieldSelection,
    type AvailableCustomField,
    type CustomFieldPolicySnapshot,
    type CustomFieldSelection,
  } from './CustomFieldPolicySettings.svelte.js';

  let { enabled = $bindable() }: { enabled: boolean } = $props();

  let availableFields = $state<AvailableCustomField[]>([]);
  let policy = $state<CustomFieldPolicySnapshot[]>([]);
  let selections = $state<CustomFieldSelection[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let status = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  let selectedCount = $derived(selections.filter(({ selected }) => selected).length);
  let staleEntries = $derived(staleCustomFieldPolicyEntries(availableFields, policy));

  function fieldFor(fieldId: number): AvailableCustomField | undefined {
    return availableFields.find(({ id }) => id === fieldId);
  }

  function toggle(fieldId: number): void {
    selections = toggleCustomFieldSelection(selections, fieldId);
    status = null;
  }

  function updateGuidance(fieldId: number, guidance: string): void {
    selections = selections.map((selection) =>
      selection.fieldId === fieldId ? { ...selection, guidance } : selection,
    );
    status = null;
  }

  async function loadPolicy(): Promise<void> {
    loading = true;
    status = null;
    try {
      const response = await fetch('/api/v1/ai/custom-fields/policy');
      const body = await response.json();
      if (!response.ok) throw new Error('Unable to load Paperless custom fields');
      availableFields = body.data?.availableFields ?? [];
      policy = body.data?.policy ?? [];
      selections = createCustomFieldSelections(availableFields, policy);
    } catch {
      status = {
        type: 'error',
        message: 'Custom fields could not be loaded from Paperless-NGX. Try again before enabling.',
      };
    } finally {
      loading = false;
    }
  }

  async function savePolicy(): Promise<void> {
    saving = true;
    status = null;
    try {
      const response = await fetch('/api/v1/ai/custom-fields/policy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: serializeCustomFieldSelections(selections) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error('Policy rejected');
      policy = body.data?.policy ?? [];
      selections = createCustomFieldSelections(availableFields, policy);
      status = { type: 'success', message: 'Custom-field selection saved for review-only AI.' };
    } catch {
      status = {
        type: 'error',
        message: 'Custom-field selection was not saved. Refresh the Paperless fields and retry.',
      };
    } finally {
      saving = false;
    }
  }

  onMount(loadPolicy);
</script>

<div class="w-full">
  <label class="text-muted flex items-center gap-2 text-sm">
    <Checkbox bind:checked={enabled} disabled={loading || (selectedCount === 0 && !enabled)} />
    Custom Fields
  </label>
  <p class="text-muted mt-1 text-xs">
    Select up to 50 existing Paperless-NGX fields. AI only recommends values; every value remains
    review-only and no field is created or applied automatically.
  </p>

  {#if loading}
    <p class="text-muted mt-3 text-xs" role="status">Loading Paperless custom fields…</p>
  {:else}
    {#if staleEntries.length > 0}
      <p class="text-warn mt-3 text-xs" role="alert">
        {staleEntries.length} saved field {staleEntries.length === 1
          ? 'definition needs'
          : 'definitions need'}
        review because Paperless changed. Save a fresh selection before AI processing.
      </p>
    {/if}

    <div class="border-border mt-3 max-h-80 space-y-3 overflow-y-auto border p-3">
      {#if availableFields.length === 0}
        <p class="text-muted text-xs">No supported Paperless custom fields are available.</p>
      {/if}
      {#each selections as selection (selection.fieldId)}
        {@const field = fieldFor(selection.fieldId)}
        {#if field}
          <div class="border-soft border-b pb-3 last:border-0 last:pb-0">
            <label class="text-ink flex items-start gap-2 text-sm">
              <Checkbox
                checked={selection.selected}
                onchange={() => toggle(selection.fieldId)}
                disabled={isCustomFieldSelectionDisabled(selection, selectedCount)}
                class="mt-0.5"
              />
              <span>
                <span class="font-medium">{field.name}</span>
                <span class="text-muted ml-2 font-mono text-xs">
                  {field.dataType} · ID {field.id}
                </span>
              </span>
            </label>
            {#if selection.selected}
              <TextField
                id={`custom-field-guidance-${field.id}`}
                label="Optional extraction guidance"
                value={selection.guidance}
                oninput={(event) =>
                  updateGuidance(
                    selection.fieldId,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
                maxlength={500}
                placeholder="For example: use the final amount due"
                class="mt-2"
              />
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <div class="mt-3 flex items-center gap-3">
      <Button size="sm" onclick={savePolicy} disabled={saving}>
        {saving ? 'Saving…' : `Save selected fields (${selectedCount}/50)`}
      </Button>
      <Button variant="outline" size="sm" onclick={loadPolicy} disabled={saving}>
        Refresh from Paperless
      </Button>
    </div>
  {/if}

  {#if status}
    <p
      class="mt-2 border-l-2 py-1 pl-3 text-xs {status.type === 'success'
        ? "border-success text-success before:content-['■_']"
        : "border-ember text-ember before:content-['●_']"}"
      role={status.type === 'error' ? 'alert' : 'status'}
    >
      {status.message}
    </p>
  {/if}
</div>
