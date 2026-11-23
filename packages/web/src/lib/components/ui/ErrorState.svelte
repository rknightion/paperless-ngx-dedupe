<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Bold line naming what failed. */
    title?: string;
    /**
     * Plain language, with the fix. Never raw API text: "The sync could not be
     * started. Please try again.", not the response body.
     */
    message: string;
    /** Mono request detail, e.g. "GET /api/v1/duplicates · 504 · 14:22:41". */
    detail?: string;
    /** Usually a Button labelled "Try again". */
    action?: Snippet;
    class?: string;
  }

  let {
    title = 'Something went wrong',
    message,
    detail,
    action,
    class: className = '',
  }: Props = $props();
</script>

<!-- Inline in the region that failed: 1px ember border on a 7% ember tint. -->
<div class="border-ember bg-ember/7 border px-4 py-4 {className}" role="alert">
  <p class="status-word text-ember"><span aria-hidden="true">●</span> FAIL</p>
  <h3 class="text-ink mt-1 text-base font-semibold">{title}</h3>
  <p class="text-ink-light mt-1 max-w-prose text-base">{message}</p>
  {#if detail}
    <p class="text-muted mt-2 font-mono text-xs tabular-nums">{detail}</p>
  {/if}
  {#if action}
    <div class="mt-3">{@render action()}</div>
  {/if}
</div>
