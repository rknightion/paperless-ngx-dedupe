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
    text: 'h-4',
    block: '',
    circle: 'rounded-full',
  } as const;
</script>

<!-- Shape a skeleton like the content it stands in for, and keep it inside the
     panel whose content it replaces, never loose on the canvas. It appears
     only after 200ms, so a fast load never flashes it. -->
<div
  class="skeleton flex flex-col gap-2 {className}"
  role="status"
  aria-live="polite"
  aria-label="Loading"
>
  {#each { length: variant === 'text' ? lines : 1 } as _, i (i)}
    <div
      class={SHAPES[variant]}
      style="
        {width
        ? `width: ${width};`
        : variant === 'text' && i === lines - 1 && lines > 1
          ? 'width: 60%;'
          : 'width: 100%;'}
        {height ? `height: ${height};` : ''}
        background-image: linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 9%, var(--color-surface)) 0%, color-mix(in oklab, var(--color-ink) 15%, var(--color-surface)) 50%, color-mix(in oklab, var(--color-ink) 9%, var(--color-surface)) 100%);
        background-size: 200% 100%;
        animation: shimmer 1.5s linear infinite;"
    ></div>
  {/each}
</div>

<style>
  .skeleton {
    opacity: 0;
    animation: skeleton-appear 1ms linear 200ms forwards;
  }

  @keyframes skeleton-appear {
    to {
      opacity: 1;
    }
  }
</style>
