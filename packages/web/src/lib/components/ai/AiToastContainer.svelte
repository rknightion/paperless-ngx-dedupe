<script lang="ts">
  import { getToasts, dismissToast } from './AiReviewStore.svelte';
  import { fly } from 'svelte/transition';
  import { CircleCheck, CircleX, TriangleAlert } from 'lucide-svelte';
</script>

{#if getToasts().length > 0}
  <div class="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
    {#each getToasts() as toast (toast.id)}
      <div
        transition:fly={{ x: 300, duration: 300 }}
        class="flex max-w-md min-w-80 items-start gap-3 rounded-lg border px-4 py-3 shadow-lg
          {toast.type === 'success'
          ? 'bg-success-light border-success/20 text-success'
          : toast.type === 'error'
            ? 'bg-ember-light border-ember/20 text-ember'
            : 'bg-warn-light border-warn/20 text-warn'}"
      >
        <!-- Icon -->
        {#if toast.type === 'success'}
          <CircleCheck class="mt-0.5 h-5 w-5 shrink-0" />
        {:else if toast.type === 'error'}
          <CircleX class="mt-0.5 h-5 w-5 shrink-0" />
        {:else}
          <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0" />
        {/if}

        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{toast.message}</p>
          {#if toast.detail}
            <p class="mt-0.5 text-xs opacity-75">{toast.detail}</p>
          {/if}
        </div>

        <button
          onclick={() => dismissToast(toast.id)}
          class="shrink-0 opacity-50 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}
