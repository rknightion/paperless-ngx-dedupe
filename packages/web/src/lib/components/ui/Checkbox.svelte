<script lang="ts">
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import MinusIcon from 'phosphor-svelte/lib/MinusIcon';

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
  <!-- Narrow layouts: the 16px box sits inside a 44px target. -->
  <span class="inline-flex max-md:p-3.5">
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
        class="peer h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-50 max-md:h-4 max-md:w-4 {checked ||
        indeterminate
          ? 'bg-accent border-accent'
          : 'bg-surface-raised border-border-hover'}"
      />
      <span
        class="text-on-accent pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {#if indeterminate}
          <MinusIcon size={10} weight="bold" aria-hidden="true" />
        {:else if checked}
          <CheckIcon size={10} weight="bold" aria-hidden="true" />
        {/if}
      </span>
    </span>
  </span>
  {#if label}
    <label for={fieldId} class="text-ink cursor-pointer text-base">{label}</label>
  {/if}
</span>
