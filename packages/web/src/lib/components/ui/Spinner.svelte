<script lang="ts">
  interface Props {
    /** sm inside buttons, md standalone, lg for a whole-panel wait. */
    size?: 'sm' | 'md' | 'lg';
    /** Accessible label. Set to null inside a control that already says it. */
    label?: string | null;
    class?: string;
  }

  let { size = 'md', label = 'Loading', class: className = '' }: Props = $props();

  const SIZES = {
    sm: 'h-3.5 w-3.5 border',
    md: 'h-5 w-5 border-2',
    lg: 'h-8 w-8 border-2',
  } as const;
</script>

<!-- A spinner only belongs inside a button, or where the shape of the content
     is unknown. If the shape IS known, use a Skeleton instead. -->
<span
  class="inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent {SIZES[
    size
  ]} {className}"
  role={label ? 'status' : undefined}
  aria-label={label ?? undefined}
  aria-hidden={label ? undefined : 'true'}
></span>
