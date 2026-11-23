<script lang="ts">
  import { initFaro } from '$lib/faro';
  import { initFaroRouteTracking } from '$lib/faro-route-tracker';
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import ActivityPanel from '$lib/components/activity/ActivityPanel.svelte';
  import ActivityLiveRegion from '$lib/components/activity/ActivityLiveRegion.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import { type IconComponent } from '$lib/components/ui/icon-types';
  import { theme } from '$lib/theme/ThemeStore.svelte';
  import '../app.css';
  import { page } from '$app/state';
  import { untrack, onMount } from 'svelte';
  import BrainIcon from 'phosphor-svelte/lib/BrainIcon';
  import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
  import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
  import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
  import ListIcon from 'phosphor-svelte/lib/ListIcon';
  import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFourIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import IconContext from 'phosphor-svelte/lib/IconContext';

  let { data, children } = $props();
  let sidebarOpen = $state(false);

  type NavItem = {
    href: string;
    label: string;
    icon: IconComponent;
    requiresAi?: boolean;
  };

  const NAV: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: SquaresFourIcon },
    { href: '/documents', label: 'Documents', icon: FileTextIcon },
    { href: '/duplicates', label: 'Duplicates', icon: CopyIcon },
    { href: '/ai-processing', label: 'AI Processing', icon: BrainIcon, requiresAi: true },
    { href: '/jobs', label: 'Jobs', icon: ClockCounterClockwiseIcon },
    { href: '/settings', label: 'Settings', icon: GearSixIcon },
  ];

  const items = $derived(NAV.filter((item) => !item.requiresAi || data.aiEnabled));

  // Dashboard is an exact match; everything else owns its subtree.
  function isActive(href: string, pathname: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  untrack(() => {
    if (data.faroEnabled && data.faroCollectorUrl) {
      initFaro(data.faroCollectorUrl, data.faroServiceNamespace);
    }
  });

  onMount(() => {
    // The inline script in app.html has already painted the class; this only
    // adopts the stored preference and starts following the OS.
    const stopTheme = theme.init();
    void activity.start();
    if (data.faroEnabled) {
      initFaroRouteTracking();
    }
    return () => {
      activity.stop();
      stopTheme();
    };
  });

  $effect(() => {
    void page.url.pathname;
    sidebarOpen = false;
  });
</script>

<!-- Phosphor icons render role="img". Every icon here is decorative (its
     control or text carries the name), so hide them from assistive tech by
     default. An icon that needs a name can override aria-hidden itself. -->
<IconContext values={{ 'aria-hidden': 'true' }}>
  <div class="flex min-h-screen">
    <!-- Mobile overlay backdrop -->
    <div
      class="fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 md:hidden {sidebarOpen
        ? 'opacity-100'
        : 'pointer-events-none opacity-0'}"
      onclick={() => (sidebarOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
      role="button"
      tabindex="-1"
    ></div>

    <aside
      class="border-sidebar-border text-sidebar-ink fixed top-0 left-0 z-40 flex h-full w-64 flex-col border-r transition-transform duration-200 ease-in-out {sidebarOpen
        ? 'translate-x-0'
        : '-translate-x-full'} md:translate-x-0"
      style="background: linear-gradient(180deg, var(--color-sidebar-top) 0%, var(--color-sidebar) 100%)"
    >
      <div class="flex items-center justify-between p-6">
        <a href="/" class="flex items-center gap-3">
          <!-- The m7kni mark stands alone with the product name beside it.
             Never CSS-filter it; inverting changes the colour of the dot. -->
          <img src="/m7kni-mark.svg" alt="" class="h-9 w-9 rounded-lg" />
          <span class="text-sidebar-ink-active text-lg font-bold">Paperless NGX Dedupe</span>
        </a>
        <button
          class="text-sidebar-ink hover:text-sidebar-ink-active md:hidden"
          onclick={() => (sidebarOpen = false)}
          aria-label="Close sidebar"
        >
          <XIcon class="h-6 w-6" />
        </button>
      </div>

      <nav class="flex flex-col gap-1 px-3">
        {#each items as item (item.href)}
          {@const active = isActive(item.href, page.url.pathname)}
          <a
            href={item.href}
            aria-current={active ? 'page' : undefined}
            class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {active
              ? 'bg-sidebar-active text-sidebar-ink-active'
              : 'hover:bg-sidebar-hover text-sidebar-ink hover:text-sidebar-ink-active'}"
          >
            <span class="flex items-center gap-3">
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </span>
          </a>
        {/each}
      </nav>

      <div class="mt-auto flex flex-col gap-3 px-6 pb-6">
        <ThemeToggle />
        <p class="text-sidebar-ink text-xs">Paperless NGX Dedupe</p>
      </div>
    </aside>

    <main class="bg-canvas min-h-screen min-w-0 flex-1 p-4 sm:p-6 md:ml-64 md:p-8">
      <!-- Mobile hamburger -->
      <button
        class="text-ink mb-4 md:hidden"
        onclick={() => (sidebarOpen = true)}
        aria-label="Open sidebar"
      >
        <ListIcon class="h-6 w-6" />
      </button>
      {#if data.readOnly}
        <aside role="note" aria-label="Paperless read-only" class="panel text-ink mb-6">
          <p class="font-semibold">Paperless is read-only</p>
          <p class="text-muted mt-1 text-sm">
            Changes to Paperless are disabled. Sync, analysis, AI suggestions and local review
            remain available.
          </p>
        </aside>
      {/if}
      {@render children()}
    </main>
    <ActivityPanel jobs={activity.jobs} />
    <ActivityLiveRegion jobs={activity.jobs} />
  </div>
</IconContext>
