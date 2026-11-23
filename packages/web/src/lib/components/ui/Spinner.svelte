<script lang="ts">
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

  interface Props {
    /** sm inside buttons (14px), md standalone, lg for a whole-panel wait. */
    size?: 'sm' | 'md' | 'lg';
    /** Accessible label. Set to null inside a control that already says it. */
    label?: string | null;
    class?: string;
  }

  let { size = 'md', label = 'Loading', class: className = '' }: Props = $props();

  const SIZES = { sm: 14, md: 16, lg: 28 } as const;
</script>

<!-- A spinner only belongs inside a button, or where the shape of the content
     is unknown. If the shape IS known, use a Skeleton instead. One second,
     linear, currentColor; prefers-reduced-motion leaves a static glyph. -->
<span
  class="inline-flex shrink-0 animate-[spin_1s_linear_infinite] motion-reduce:animate-none {className}"
  role={label ? 'status' : undefined}
  aria-label={label ?? undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <CircleNotchIcon size={SIZES[size]} aria-hidden="true" />
</span>
