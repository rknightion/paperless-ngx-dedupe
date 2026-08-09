<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /**
     * There is deliberately no solid variant. The brand accent is green and so
     * is success, so state and action are told apart by treatment, never hue:
     * state is always a tinted pill, the accent is always a solid fill or a
     * link. A solid-filled badge collapses that distinction.
     */
    tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'ember' | 'product';
    size?: 'sm' | 'md';
    class?: string;
    children: Snippet;
  }

  let { tone = 'neutral', size = 'sm', class: className = '', children }: Props = $props();

  const TONES = {
    neutral: 'bg-canvas-deep text-ink-faint',
    accent: 'bg-accent-light text-accent',
    success: 'bg-success-light text-success',
    warn: 'bg-warn-light text-warn',
    ember: 'bg-ember-light text-ember',
    product: 'bg-accent-product-light text-accent-product',
  } as const;

  const SIZES = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' } as const;
</script>

<span
  class="inline-flex items-center gap-1 rounded-full font-medium {TONES[tone]} {SIZES[
    size
  ]} {className}"
>
  {@render children()}
</span>
