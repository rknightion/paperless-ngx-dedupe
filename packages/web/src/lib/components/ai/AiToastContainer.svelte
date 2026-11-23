<script lang="ts">
  import { getToasts, dismissToast } from './AiReviewStore.svelte';
  import { fly } from 'svelte/transition';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';

  // Never more than two at once: the newest two win.
  const visible = $derived(getToasts().slice(-2));

  function accent(type: string): string {
    if (type === 'success') return 'border-l-success';
    if (type === 'error') return 'border-l-ember';
    if (type === 'warning') return 'border-l-warn';
    return 'border-l-accent';
  }

  function tone(type: string): string {
    if (type === 'success') return 'text-success';
    if (type === 'error') return 'text-ember';
    if (type === 'warning') return 'text-warn';
    return 'text-accent';
  }
</script>

{#if visible.length > 0}
  <div class="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
    {#each visible as toast (toast.id)}
      <div
        transition:fly={{ x: 12, duration: 160 }}
        class="bg-surface-raised border-border-hover text-ink flex max-w-md min-w-80 items-start gap-3 rounded-md border border-l-2 px-4 py-3 shadow-lg {accent(
          toast.type,
        )}"
      >
        <span class="mt-0.5 shrink-0 {tone(toast.type)}">
          {#if toast.type === 'success'}
            <CheckCircleIcon class="h-4 w-4" />
          {:else if toast.type === 'error'}
            <XCircleIcon class="h-4 w-4" />
          {:else if toast.type === 'warning'}
            <WarningIcon class="h-4 w-4" />
          {:else}
            <InfoIcon class="h-4 w-4" />
          {/if}
        </span>

        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{toast.message}</p>
          {#if toast.detail}
            <p class="text-muted mt-0.5 text-sm">{toast.detail}</p>
          {/if}
        </div>

        <button
          onclick={() => dismissToast(toast.id)}
          class="text-muted hover:text-ink shrink-0"
          aria-label="Dismiss notification"
        >
          <XIcon class="h-4 w-4" />
        </button>
      </div>
    {/each}
  </div>
{/if}
