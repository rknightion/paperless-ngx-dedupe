<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CircleAlert } from 'lucide-svelte';

  interface Props {
    title?: string;
    /**
     * Plain language, actionable. Never raw API text — "The sync could not be
     * started. Please try again.", not the response body.
     */
    message: string;
    /** Usually a Button labelled "Try again". */
    action?: Snippet;
    class?: string;
  }

  let { title = 'Something went wrong', message, action, class: className = '' }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center px-4 py-16 text-center {className}"
  role="alert"
>
  <div class="bg-ember-light text-ember flex h-16 w-16 items-center justify-center rounded-2xl">
    <CircleAlert size={28} aria-hidden="true" />
  </div>
  <h3 class="text-ink mt-4 text-base font-semibold">{title}</h3>
  <p class="text-ink-faint mt-1 max-w-96 text-sm">{message}</p>
  {#if action}
    <div class="mt-4">{@render action()}</div>
  {/if}
</div>
