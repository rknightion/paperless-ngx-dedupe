<script lang="ts">
  interface Tab {
    value: string;
    label: string;
    /** Rendered in mono tabular muted type beside the label. */
    count?: number;
    /** Kept so existing call sites compile. v2 has no tinted count pills. */
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

  // Underline tabs: 36px high, 2px accent underline when selected, ink when
  // selected and muted otherwise. No dark: variants, the tokens swap themselves.
  function tabClass(isActive: boolean): string {
    return `inline-flex h-9 items-center border-b-2 px-3.5 text-base font-medium transition-colors ${
      isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
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
          <span class="text-muted ml-1.5 font-mono tabular-nums">{tab.count}</span>
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
          <span class="text-muted ml-1.5 font-mono tabular-nums">{tab.count}</span>
        {/if}
      </button>
    {/if}
  {/each}
</nav>
