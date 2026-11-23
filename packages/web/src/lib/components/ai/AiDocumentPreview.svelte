<script lang="ts">
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';

  interface Props {
    src?: string;
    mode?: 'thumb' | 'preview';
  }

  let { src, mode = 'thumb' }: Props = $props();

  let loadState = $state<'loading' | 'loaded' | 'error'>('loading');

  const unavailable = $derived(!src || loadState === 'error');

  // Reset load state when src changes
  $effect(() => {
    void src;
    loadState = 'loading';
  });
</script>

{#if mode === 'thumb'}
  <div class="relative aspect-[3/4] w-full">
    {#if !unavailable && loadState === 'loading'}
      <div class="bg-canvas-deep absolute inset-0 animate-pulse"></div>
    {/if}
    {#if !unavailable}
      <img
        {src}
        alt="Document thumbnail"
        class="h-full w-full object-cover"
        class:invisible={loadState === 'loading'}
        onload={() => (loadState = 'loaded')}
        onerror={() => (loadState = 'error')}
      />
    {:else}
      <div class="border-border bg-canvas flex h-full w-full items-center justify-center border">
        <FileTextIcon class="text-muted h-8 w-8" />
      </div>
    {/if}
  </div>
{:else}
  <div class="relative h-[400px] w-full">
    {#if !unavailable && loadState === 'loading'}
      <div class="bg-canvas-deep absolute inset-0 animate-pulse"></div>
    {/if}
    {#if !unavailable}
      <iframe
        {src}
        title="Document preview"
        class="border-border w-full border"
        class:invisible={loadState === 'loading'}
        style="height: 400px;"
        onload={() => (loadState = 'loaded')}
        onerror={() => (loadState = 'error')}
      ></iframe>
    {:else}
      <div
        class="border-border bg-canvas flex h-full w-full flex-col items-center justify-center gap-2 border"
      >
        <FileTextIcon class="text-muted h-8 w-8" />
        <p class="text-muted text-sm">Preview unavailable</p>
      </div>
    {/if}
  </div>
{/if}
