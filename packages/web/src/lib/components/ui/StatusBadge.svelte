<script lang="ts">
  interface Props {
    status: string;
  }

  let { status }: Props = $props();

  /**
   * Always a tinted pill, never a solid fill — that treatment is what tells
   * state apart from the accent, which is also green.
   *
   * `paused` uses the shared per-product violet rather than a raw palette
   * colour; neutral states use the canvas-deep tint. Static class strings so
   * Tailwind sees every variant.
   */
  const statusClasses: Record<string, string> = {
    pending: 'bg-warn-light text-warn',
    running: 'bg-accent-light text-accent',
    completed: 'bg-success-light text-success',
    failed: 'bg-ember-light text-ember',
    paused: 'bg-accent-product-light text-accent-product',
    cancelled: 'bg-canvas-deep text-ink-faint',
    false_positive: 'bg-canvas-deep text-ink-faint',
    ignored: 'bg-accent-light text-accent',
    deleted: 'bg-success-light text-success',
  };

  const displayLabels: Record<string, string> = {
    false_positive: 'False Positive',
  };

  let classes = $derived(statusClasses[status] ?? 'bg-canvas-deep text-ink-faint');
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {classes}"
>
  {displayLabels[status] ?? status}
</span>
