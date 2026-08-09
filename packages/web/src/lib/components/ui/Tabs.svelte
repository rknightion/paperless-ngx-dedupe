<script lang="ts">
  interface Tab {
    value: string;
    label: string;
    /** Rendered as a tinted count pill beside the label. */
    count?: number;
    countTone?: 'neutral' | 'accent' | 'success' | 'warn' | 'ember';
    /** Renders an anchor instead of a button. */
    href?: string;
  }

  interface Props {
    tabs: Tab[];
    active: string;
    ariaLabel?: string;
    class?: string;
    onchange?: (value: string) => void;
  }

  let { tabs, active, ariaLabel = 'Sections', class: className = '', onchange }: Props = $props();

  // Active is the accent underline plus accent text. No dark: variants —
  // the tokens swap themselves.
  const TONES = {
    neutral: 'bg-canvas-deep text-ink-faint',
    accent: 'bg-accent-light text-accent',
    success: 'bg-success-light text-success',
    warn: 'bg-warn-light text-warn',
    ember: 'bg-ember-light text-ember',
  } as const;

  function tabClass(isActive: boolean): string {
    return `border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
      isActive ? 'border-accent text-accent' : 'border-transparent text-ink-faint hover:text-ink'
    }`;
  }

  // Link tabs are navigation and take aria-current; button tabs are a real
  // tablist. role="tab" is only valid inside role="tablist", so the container
  // role has to follow which kind is in use rather than being fixed.
  const isNavigation = $derived(tabs.some((t) => t.href));
</script>

<nav
  class="border-border flex border-b {className}"
  role={isNavigation ? undefined : 'tablist'}
  aria-label={ariaLabel}
>
  {#each tabs as tab (tab.value)}
    {@const isActive = tab.value === active}
    {#if tab.href}
      <a href={tab.href} aria-current={isActive ? 'page' : undefined} class={tabClass(isActive)}>
        {tab.label}
        {#if tab.count}
          <span
            class="ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium {TONES[
              tab.countTone ?? 'neutral'
            ]}">{tab.count}</span
          >
        {/if}
      </a>
    {:else}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        class={tabClass(isActive)}
        onclick={() => onchange?.(tab.value)}
      >
        {tab.label}
        {#if tab.count}
          <span
            class="ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium {TONES[
              tab.countTone ?? 'neutral'
            ]}">{tab.count}</span
          >
        {/if}
      </button>
    {/if}
  {/each}
</nav>
