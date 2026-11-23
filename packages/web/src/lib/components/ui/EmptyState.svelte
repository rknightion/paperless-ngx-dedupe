<script lang="ts">
  import type { Snippet } from 'svelte';
  import { type IconComponent } from './icon-types';

  interface Props {
    /** Accepted so existing call sites compile. v2 empty states carry no glyph. */
    icon?: IconComponent;
    /** What happened, as a sentence. */
    title: string;
    /** What to do next. */
    description?: string;
    /** At most one outline Button. */
    action?: Snippet;
    class?: string;
  }

  let { title, description, action, class: className = '' }: Props = $props();
</script>

<!-- One or two sentences in muted ink, centred in the region the content
     would occupy. No illustration, no headline, no emoji. -->
<div class="flex flex-col items-center justify-center px-4 py-16 text-center {className}">
  <p class="text-muted max-w-96 text-base">{title}</p>
  {#if description}
    <p class="text-muted mt-1 max-w-96 text-base">{description}</p>
  {/if}
  {#if action}
    <div class="mt-4">{@render action()}</div>
  {/if}
</div>
