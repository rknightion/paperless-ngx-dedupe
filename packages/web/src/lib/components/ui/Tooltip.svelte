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
    <!-- Raised surface with a hairline. The two inverse tokens are re-pointed
         locally so content written for the old inverse tooltip stays legible. -->
    <div
      class="rounded-overlay border-border-hover bg-surface-raised text-ink pointer-events-none absolute z-50 w-64 border px-3 py-2 text-sm leading-relaxed shadow-md
        {position === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : ''}
        {position === 'bottom' ? 'top-full left-1/2 mt-2 -translate-x-1/2' : ''}
        {position === 'right' ? 'top-1/2 left-full ml-2 -translate-y-1/2' : ''}
        {position === 'left' ? 'top-1/2 right-full mr-2 -translate-y-1/2' : ''}"
      style="--color-inverse: var(--color-surface-raised); --color-on-inverse: var(--color-ink); animation: scale-in var(--duration-base) var(--ease-standard);"
      role="tooltip"
    >
      {text}
    </div>
  {/if}
</span>
