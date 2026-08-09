<script lang="ts">
  import { Search, X } from 'lucide-svelte';

  interface Props {
    value?: string;
    placeholder?: string;
    /** Accessible name. Required when there is no visible label. */
    ariaLabel?: string;
    name?: string;
    id?: string;
    disabled?: boolean;
    class?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    placeholder = 'Search...',
    ariaLabel = 'Search',
    name,
    id,
    disabled = false,
    class: className = '',
    onchange,
  }: Props = $props();

  function clear() {
    value = '';
    onchange?.('');
  }
</script>

<!-- The field pairs width:100% with padding for a leading glyph and a clear
     button — 76px of it. That only fits because the base layer sets
     box-sizing: border-box globally; without it this overflows its container,
     which is invisible in a flex-1 column and obvious in a fixed sidebar. -->
<div class="relative {className}">
  <span class="text-muted pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
    <Search size={16} aria-hidden="true" />
  </span>

  <input
    {id}
    {name}
    type="search"
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    bind:value
    oninput={() => onchange?.(value)}
    class="border-border bg-surface text-ink focus:border-accent focus:ring-accent w-full rounded-xl border py-2.5 pr-9 pl-10 text-sm transition-colors outline-none focus:ring-1 disabled:opacity-50"
  />

  {#if value}
    <button
      type="button"
      aria-label="Clear search"
      onclick={clear}
      class="text-muted hover:text-ink absolute top-1/2 right-3 -translate-y-1/2 p-0.5"
    >
      <X size={14} aria-hidden="true" />
    </button>
  {/if}
</div>
