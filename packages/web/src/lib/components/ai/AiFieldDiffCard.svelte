<script lang="ts">
  import { ConfidenceBadge } from '$lib/components';
  import EqualsIcon from 'phosphor-svelte/lib/EqualsIcon';
  import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';

  interface Props {
    fieldName: string;
    fieldLabel: string;
    currentValue: string | string[] | null;
    suggestedValue: string | string[] | null;
    confidence: number | null;
    checked: boolean;
    oncheck: (checked: boolean) => void;
    disabled?: boolean;
    /** When true, the field is disabled by settings — shows a badge and greys out */
    fieldDisabledByConfig?: boolean;
  }

  let {
    fieldName: _fieldName,
    fieldLabel,
    currentValue,
    suggestedValue,
    confidence,
    checked,
    oncheck,
    disabled = false,
    fieldDisabledByConfig = false,
  }: Props = $props();

  const isArrayField = $derived(Array.isArray(currentValue) || Array.isArray(suggestedValue));

  const currentArr = $derived(Array.isArray(currentValue) ? currentValue : []);
  const suggestedArr = $derived(Array.isArray(suggestedValue) ? suggestedValue : []);

  const currentSet = $derived(new Set(currentArr));
  const suggestedSet = $derived(new Set(suggestedArr));

  const valuesIdentical = $derived(() => {
    if (isArrayField) {
      if (currentArr.length !== suggestedArr.length) return false;
      const sortedCurrent = [...currentArr].sort();
      const sortedSuggested = [...suggestedArr].sort();
      return sortedCurrent.every((v, i) => v === sortedSuggested[i]);
    }
    return suggestedValue === currentValue;
  });

  const warnings = $derived(() => {
    const w: string[] = [];
    if (confidence !== null && confidence < 0.75) w.push('low_confidence');
    if (isArrayField) {
      if (valuesIdentical()) w.push('no_change');
    } else {
      if (typeof suggestedValue === 'string' && suggestedValue && !currentValue)
        w.push('will_create');
      if (!suggestedValue && currentValue) w.push('will_clear');
      if (suggestedValue === currentValue) w.push('no_change');
    }
    return w;
  });
</script>

<div class="border-border bg-surface space-y-2 border p-3" class:opacity-50={fieldDisabledByConfig}>
  <!-- Header row -->
  <div class="flex items-center gap-2">
    <input
      type="checkbox"
      checked={fieldDisabledByConfig ? false : checked}
      disabled={disabled || fieldDisabledByConfig}
      onchange={(e) => oncheck((e.target as HTMLInputElement).checked)}
      class="accent-accent h-3.5 w-3.5"
    />
    <span class="text-ink flex-1 text-sm font-semibold">{fieldLabel}</span>
    {#if fieldDisabledByConfig}
      <span class="status-word text-muted inline-flex items-center gap-1">
        <ProhibitIcon size={13} />
        DISABLED
      </span>
    {:else if confidence !== null}
      <ConfidenceBadge score={confidence} />
    {/if}
  </div>

  <!-- Body -->
  <div class="pl-6">
    {#if isArrayField}
      <!-- Array field (tags) -->
      <div class="flex flex-wrap gap-1.5">
        {#each currentArr as tag (tag)}
          {#if suggestedSet.has(tag)}
            <span class="border-border text-ink border px-1.5 font-mono text-xs">{tag}</span>
          {:else}
            <span class="border-border text-muted border px-1.5 font-mono text-xs line-through">
              {tag}
            </span>
          {/if}
        {/each}
        {#each suggestedArr as tag (tag)}
          {#if !currentSet.has(tag)}
            <span class="border-success text-ink border px-1.5 font-mono text-xs">+ {tag}</span>
          {/if}
        {/each}
        {#if currentArr.length === 0 && suggestedArr.length === 0}
          <span class="text-muted text-sm">No tags</span>
        {/if}
      </div>
    {:else}
      <!-- String field -->
      {#if suggestedValue === null && currentValue === null}
        <span class="text-muted text-sm">No suggestion</span>
      {:else if suggestedValue === currentValue}
        <span class="text-muted text-sm">{currentValue ?? 'None'}</span>
        <span class="status-word text-muted ml-2">NO CHANGE</span>
      {:else}
        <div class="flex flex-wrap items-center gap-2 text-sm">
          {#if currentValue}
            <span class="text-muted line-through">{currentValue}</span>
            <span class="text-muted font-mono" aria-hidden="true">&rarr;</span>
          {/if}
          {#if suggestedValue}
            <span class="text-ink font-medium">{suggestedValue}</span>
          {:else}
            <span class="text-muted">No suggestion</span>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Warning indicators -->
  {#if warnings().length > 0}
    <div class="flex flex-wrap gap-3 pl-6">
      {#each warnings() as warning (warning)}
        {#if warning === 'low_confidence'}
          <span class="text-warn flex items-center gap-1 text-sm">
            <WarningIcon size={13} />
            Low confidence
          </span>
        {:else if warning === 'will_create'}
          <span class="text-success flex items-center gap-1 text-sm">
            <PlusIcon size={13} />
            Will create new
          </span>
        {:else if warning === 'will_clear'}
          <span class="text-ember flex items-center gap-1 text-sm">
            <MinusIcon size={13} />
            Will clear existing
          </span>
        {:else if warning === 'no_change'}
          <span class="text-muted flex items-center gap-1 text-sm">
            <EqualsIcon size={13} />
            No change
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</div>
