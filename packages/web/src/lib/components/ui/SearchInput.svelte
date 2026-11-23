<script lang="ts">
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';

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
    onkeydown?: (e: KeyboardEvent) => void;
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
    onkeydown,
  }: Props = $props();

  function clear() {
    value = '';
    onchange?.('');
  }
</script>

<!-- 28px field. The leading glyph and the clear button pair with padding on a
     width:100% input, which relies on the global border-box. Focus is the
     global 2px accent outline; the border does not change colour. -->
<div class="relative {className}">
  <span class="text-muted pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
    <MagnifyingGlassIcon size={14} aria-hidden="true" />
  </span>

  <input
    {onkeydown}
    {id}
    {name}
    type="search"
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    bind:value
    oninput={() => onchange?.(value)}
    class="border-border bg-surface-raised text-ink placeholder:text-disabled disabled:text-disabled h-7 w-full rounded-md border pr-8 pl-7 text-base placeholder:font-mono placeholder:text-xs disabled:cursor-not-allowed disabled:bg-transparent"
  />

  {#if value}
    <button
      type="button"
      aria-label="Clear search"
      onclick={clear}
      class="text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 p-0.5"
    >
      <XIcon size={14} aria-hidden="true" />
    </button>
  {/if}
</div>
