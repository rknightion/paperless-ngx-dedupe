<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Icon as LucideIcon } from 'lucide-svelte';

  interface Props {
    title: string;
    /** One line saying what the page is for. Sentence case. */
    description?: string;
    /** Identifies the page, so it sits in an accent tile. */
    icon?: typeof LucideIcon;
    /** Usually one or two Buttons. */
    actions?: Snippet;
    class?: string;
  }

  let { title, description, icon: Glyph, actions, class: className = '' }: Props = $props();
</script>

<div class="mb-6 flex flex-wrap items-center justify-between gap-4 {className}">
  <div class="flex items-center gap-3">
    {#if Glyph}
      <!-- An icon identifying a *thing* sits in an accent tile; an icon
           identifying an *action* sits bare inside its control. -->
      <div
        class="bg-accent-light text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      >
        <Glyph size={20} aria-hidden="true" />
      </div>
    {/if}
    <div>
      <h1 class="text-ink text-2xl font-bold tracking-tight">{title}</h1>
      {#if description}
        <p class="text-ink-faint mt-0.5 text-sm">{description}</p>
      {/if}
    </div>
  </div>
  {#if actions}
    <div class="flex shrink-0 gap-2">{@render actions()}</div>
  {/if}
</div>
