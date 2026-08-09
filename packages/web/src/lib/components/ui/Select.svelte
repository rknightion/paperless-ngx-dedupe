<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value?: string;
    options: Option[];
    label?: string;
    hint?: string;
    error?: string;
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
    disabled?: boolean;
    id?: string;
    name?: string;
    class?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    options,
    label,
    hint,
    error,
    ariaLabel,
    disabled = false,
    id,
    name,
    class: className = '',
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const fieldId = $derived(id ?? uid);
  const describedBy = $derived(error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined);
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label for={fieldId} class="text-ink text-sm font-medium">{label}</label>
  {/if}

  <div class="relative">
    <select
      id={fieldId}
      {name}
      {disabled}
      bind:value
      onchange={() => onchange?.(value)}
      aria-label={label ? undefined : ariaLabel}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      class="bg-surface text-ink focus:border-accent focus:ring-accent w-full appearance-none rounded-lg border py-2 pr-9 pl-3 text-sm transition-colors outline-none focus:ring-1 disabled:opacity-50 {error
        ? 'border-ember'
        : 'border-border'}"
    >
      {#each options as option (option.value)}
        <option value={option.value} disabled={option.disabled}>{option.label}</option>
      {/each}
    </select>
    <!-- appearance-none strips the native arrow, so it is redrawn here in the
         system's own chevron rather than left to the platform. -->
    <span class="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </div>

  {#if error}
    <p id="{fieldId}-error" class="text-ember text-xs">{error}</p>
  {:else if hint}
    <p id="{fieldId}-hint" class="text-muted text-xs">{hint}</p>
  {/if}
</div>
