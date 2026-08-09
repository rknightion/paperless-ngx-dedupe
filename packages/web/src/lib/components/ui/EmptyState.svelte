<script lang="ts">
  import type { Snippet } from 'svelte';
  import { FileText, type Icon as LucideIcon } from 'lucide-svelte';

  interface Props {
    icon?: typeof LucideIcon;
    title: string;
    /** Say what happened and what to do next, in one breath. */
    description?: string;
    /** Usually a Button. */
    action?: Snippet;
    class?: string;
  }

  let {
    icon: Glyph = FileText,
    title,
    description,
    action,
    class: className = '',
  }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center px-4 py-16 text-center {className}">
  <div class="bg-canvas-deep text-muted flex h-16 w-16 items-center justify-center rounded-2xl">
    <Glyph size={28} aria-hidden="true" />
  </div>
  <h3 class="text-ink mt-4 text-base font-semibold">{title}</h3>
  {#if description}
    <p class="text-ink-faint mt-1 max-w-96 text-sm">{description}</p>
  {/if}
  {#if action}
    <div class="mt-4">{@render action()}</div>
  {/if}
</div>
