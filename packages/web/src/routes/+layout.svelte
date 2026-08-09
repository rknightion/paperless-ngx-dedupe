<script lang="ts">
  import { initFaro } from '$lib/faro';
  import { initFaroRouteTracking } from '$lib/faro-route-tracker';
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import ActivityPanel from '$lib/components/activity/ActivityPanel.svelte';
  import ActivityLiveRegion from '$lib/components/activity/ActivityLiveRegion.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import { theme } from '$lib/theme/ThemeStore.svelte';
  import '../app.css';
  import { page } from '$app/stores';
  import { untrack, onMount } from 'svelte';
  import {
    LayoutDashboard,
    FileText,
    Copy,
    Settings,
    X,
    Menu,
    Brain,
    History,
  } from 'lucide-svelte';

  let { data, children } = $props();
  let sidebarOpen = $state(false);

  // lucide-svelte v1 still ships legacy class components, so Svelte 5's
  // `Component` type rejects them. Borrow the type from one of the icons.
  type NavItem = {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    requiresAi?: boolean;
  };

  const NAV: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/documents', label: 'Documents', icon: FileText },
    { href: '/duplicates', label: 'Duplicates', icon: Copy },
    { href: '/ai-processing', label: 'AI Processing', icon: Brain, requiresAi: true },
    { href: '/jobs', label: 'Jobs', icon: History },
    { href: '/settings', label: 'Settings', icon: Settings },
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
    void $page.url.pathname;
    sidebarOpen = false;
  });
</script>

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
    class="border-sidebar-border fixed top-0 left-0 z-40 flex h-full w-64 flex-col border-r text-white transition-transform duration-200 ease-in-out {sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'} md:translate-x-0"
    style="background: linear-gradient(180deg, var(--color-sidebar-top) 0%, var(--color-sidebar) 100%)"
  >
    <div class="flex items-center justify-between p-6">
      <a href="/" class="flex items-center gap-3">
        <!-- The m7kni mark stands alone with the product name beside it.
             Never CSS-filter it; inverting turns the jade dot pink. -->
        <img src="/m7kni-mark.svg" alt="" class="h-9 w-9 rounded-lg" />
        <span class="text-lg font-bold text-white">Paperless NGX Dedupe</span>
      </a>
      <button
        class="text-white/70 hover:text-white md:hidden"
        onclick={() => (sidebarOpen = false)}
        aria-label="Close sidebar"
      >
        <X class="h-6 w-6" />
      </button>
    </div>

    <nav class="flex flex-col gap-1 px-3">
      {#each items as item (item.href)}
        {@const active = isActive(item.href, $page.url.pathname)}
        <a
          href={item.href}
          aria-current={active ? 'page' : undefined}
          class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {active
            ? 'bg-sidebar-active text-white'
            : 'hover:bg-sidebar-hover text-white/70 hover:text-white'}"
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
      <p class="text-xs text-white/40">Paperless NGX Dedupe</p>
    </div>
  </aside>

  <main class="bg-canvas min-h-screen min-w-0 flex-1 p-4 sm:p-6 md:ml-64 md:p-8">
    <!-- Mobile hamburger -->
    <button
      class="text-ink mb-4 md:hidden"
      onclick={() => (sidebarOpen = true)}
      aria-label="Open sidebar"
    >
      <Menu class="h-6 w-6" />
    </button>
    {@render children()}
  </main>
  <ActivityPanel jobs={activity.jobs} />
  <ActivityLiveRegion jobs={activity.jobs} />
</div>
