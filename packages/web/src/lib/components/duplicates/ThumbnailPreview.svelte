<script lang="ts">
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';

  interface Props {
    src?: string | null;
    alt: string;
    size?: 'sm' | 'md';
  }

  let { src, alt, size = 'sm' }: Props = $props();

  let hasError = $state(false);
  let hovered = $state(false);

  const dimensions = $derived(
    size === 'sm' ? { width: 40, height: 56 } : { width: 64, height: 90 },
  );
</script>

<span
  class="relative inline-flex shrink-0"
  role="img"
  aria-label={alt}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
>
  {#if src && !hasError}
    <img
      {src}
      {alt}
      width={dimensions.width}
      height={dimensions.height}
      class="border-soft rounded-sm border object-cover"
      style="width: {dimensions.width}px; height: {dimensions.height}px;"
      loading="lazy"
      onerror={() => (hasError = true)}
    />
  {:else}
    <div
      class="border-soft bg-canvas text-muted flex items-center justify-center rounded-sm border"
      style="width: {dimensions.width}px; height: {dimensions.height}px;"
    >
      <FileTextIcon class="h-4 w-4" />
    </div>
  {/if}

  <!-- Hover-to-enlarge popover -->
  {#if hovered && src && !hasError}
    <div
      class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2"
      role="tooltip"
    >
      <img
        {src}
        alt="{alt} (enlarged)"
        class="border-border-hover bg-surface-raised rounded-overlay h-auto w-[500px] max-w-none border shadow-lg"
      />
    </div>
  {/if}
</span>
