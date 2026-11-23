<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /**
     * Kept so existing call sites compile. v2 has no tinted-pill vocabulary:
     * every tone renders the same hairline container. State belongs in
     * StatusBadge (a mono status word) and metadata in plain mono text.
     */
    tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'ember';
    size?: 'sm' | 'md';
    class?: string;
    children: Snippet;
  }

  let { tone = 'neutral', size = 'sm', class: className = '', children }: Props = $props();

  // Present only so the props are read; the treatment does not vary by tone.
  const SIZES = { sm: 'px-1.5 py-0.5', md: 'px-2 py-1' } as const;
  void tone;
</script>

<!-- Square 3px corners, 1px hairline, no fill, ink-light 11px mono text. -->
<span
  class="border-border text-ink-light inline-flex items-center gap-1 rounded-sm border font-mono text-xs {SIZES[
    size
  ]} {className}"
>
  {@render children()}
</span>
