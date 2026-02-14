<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    children: Snippet;
  }

  let { text, position = 'top', children }: Props = $props();
  let visible = $state(false);
</script>

<span
  class="relative inline-flex"
  role="group"
  onmouseenter={() => (visible = true)}
  onmouseleave={() => (visible = false)}
>
  {@render children()}
  {#if visible}
    <div
      class="bg-ink pointer-events-none absolute z-50 w-64 rounded-lg px-3 py-2 text-xs leading-relaxed text-white shadow-lg
        {position === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : ''}
        {position === 'bottom' ? 'top-full left-1/2 mt-2 -translate-x-1/2' : ''}
        {position === 'right' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : ''}
        {position === 'left' ? 'right-full top-1/2 mr-2 -translate-y-1/2' : ''}"
      role="tooltip"
    >
      {text}
      <div
        class="bg-ink absolute h-2 w-2 rotate-45
          {position === 'top' ? 'top-full left-1/2 -mt-1 -translate-x-1/2' : ''}
          {position === 'bottom' ? 'bottom-full left-1/2 -mb-1 -translate-x-1/2' : ''}
          {position === 'right' ? 'right-full top-1/2 -mr-1 -translate-y-1/2' : ''}
          {position === 'left' ? 'left-full top-1/2 -ml-1 -translate-y-1/2' : ''}"
      ></div>
    </div>
  {/if}
</span>
