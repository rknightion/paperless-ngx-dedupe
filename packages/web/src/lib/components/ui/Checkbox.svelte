<script lang="ts">
  import { Check, Minus } from 'lucide-svelte';

  interface Props {
    checked?: boolean;
    /** Renders the dash state for a partially-selected group. */
    indeterminate?: boolean;
    disabled?: boolean;
    label?: string;
    ariaLabel?: string;
    id?: string;
    name?: string;
    value?: string;
    class?: string;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    indeterminate = false,
    disabled = false,
    label,
    ariaLabel,
    id,
    name,
    value,
    class: className = '',
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const fieldId = $derived(id ?? uid);
</script>

<span class="inline-flex items-center gap-2 {className}">
  <span class="relative inline-flex">
    <!-- The native input stays in the DOM and keeps focus, keyboard and form
         semantics; the visible box is drawn on top of it. -->
    <input
      id={fieldId}
      type="checkbox"
      {name}
      {value}
      {disabled}
      bind:checked
      {indeterminate}
      onchange={() => onchange?.(checked)}
      aria-label={label ? undefined : ariaLabel}
      class="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-50 {checked ||
      indeterminate
        ? 'bg-accent border-accent'
        : 'bg-surface border-border hover:border-border-hover'}"
    />
    <span
      class="text-on-accent pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {#if indeterminate}
        <Minus size={12} aria-hidden="true" />
      {:else if checked}
        <Check size={12} aria-hidden="true" />
      {/if}
    </span>
  </span>
  {#if label}
    <label for={fieldId} class="text-ink cursor-pointer text-sm">{label}</label>
  {/if}
</span>
