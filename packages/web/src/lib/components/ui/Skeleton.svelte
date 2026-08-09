<script lang="ts">
  interface Props {
    /** text = a line of copy, block = a filled area, circle = an avatar or tile. */
    variant?: 'text' | 'block' | 'circle';
    width?: string;
    height?: string;
    /** Number of stacked lines. `text` only. */
    lines?: number;
    class?: string;
  }

  let { variant = 'text', width, height, lines = 1, class: className = '' }: Props = $props();

  const SHAPES = {
    text: 'h-4 rounded',
    block: 'rounded-lg',
    circle: 'rounded-full',
  } as const;
</script>

<!-- Shape a skeleton like the content it stands in for, and keep it inside the
     panel whose content it replaces — never loose on the canvas. -->
<div class="flex flex-col gap-2 {className}" role="status" aria-live="polite" aria-label="Loading">
  {#each { length: variant === 'text' ? lines : 1 } as _, i (i)}
    <div
      class="bg-canvas-deep {SHAPES[variant]}"
      style="
        {width
        ? `width: ${width};`
        : variant === 'text' && i === lines - 1 && lines > 1
          ? 'width: 60%;'
          : 'width: 100%;'}
        {height ? `height: ${height};` : ''}
        background-image: linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-surface) 70%, transparent) 50%, transparent 100%);
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;"
    ></div>
  {/each}
</div>
