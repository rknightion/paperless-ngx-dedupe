<script lang="ts">
  import type { Snippet } from 'svelte';
  import { type IconComponent } from './icon-types';

  interface Props {
    title: string;
    /** One line saying what the page is for. Sentence case. */
    description?: string;
    /** Accepted so existing call sites compile. v2 drops the accent icon tile. */
    icon?: IconComponent;
    /** Usually one or two Buttons. */
    actions?: Snippet;
    class?: string;
  }

  let { title, description, actions, class: className = '' }: Props = $props();
</script>

<div class="mb-6 flex flex-wrap items-center justify-between gap-4 {className}">
  <div>
    <h1 class="text-ink text-xl font-semibold">{title}</h1>
    {#if description}
      <p class="text-muted mt-0.5 text-sm">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 gap-2">{@render actions()}</div>
  {/if}
</div>
