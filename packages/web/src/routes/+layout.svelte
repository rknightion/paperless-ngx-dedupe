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
  import { untrack, onMount, tick } from 'svelte';
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
  // Below 768px the rail leaves the flow and returns as a drawer.
  let narrow = $state(false);
  let drawer: HTMLElement | undefined = $state();
  let menuButton: HTMLButtonElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();

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

  // The top bar context is the route path, never the Paperless host.
  const context = $derived(page.route.id ?? page.url.pathname);

  // While the drawer is open everything behind the scrim is inert, which is
  // the focus trap; a closed drawer is inert so it cannot take focus offscreen.
  const contentInert = $derived(narrow && sidebarOpen);
  const drawerInert = $derived(narrow && !sidebarOpen);

  // Dashboard is an exact match; everything else owns its subtree.
  function isActive(href: string, pathname: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  async function openDrawer(): Promise<void> {
    sidebarOpen = true;
    await tick();
    if (contentInert) closeButton?.focus();
  }

  async function closeDrawer(): Promise<void> {
    sidebarOpen = false;
    // The opener is inert until Svelte updates the background after closing.
    await tick();
    if (!sidebarOpen && narrow) menuButton?.focus();
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!sidebarOpen || !narrow) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      void closeDrawer();
      return;
    }
    if (event.key !== 'Tab' || !drawer) return;
    const focusable = [
      ...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
    const query = window.matchMedia('(max-width: 767.98px)');
    narrow = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      narrow = event.matches;
      if (!event.matches) sidebarOpen = false;
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
      activity.stop();
      stopTheme();
    };
  });

  $effect(() => {
    void page.url.pathname;
    sidebarOpen = false;
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- Phosphor icons render role="img". Every icon here is decorative (its
     control or text carries the name), so hide them from assistive tech by
     default. An icon that needs a name can override aria-hidden itself. -->
<IconContext values={{ 'aria-hidden': 'true' }}>
  <!-- The shell never scrolls: the rail and top bar are fixed and main is the
       only scrolling region. -->
  <div class="bg-canvas flex h-dvh overflow-hidden">
    {#if sidebarOpen}
      <button
        type="button"
        class="bg-inverse/60 fixed inset-0 z-30 md:hidden"
        tabindex="-1"
        aria-hidden="true"
        onclick={() => void closeDrawer()}
      ></button>
    {/if}

    <div
      bind:this={drawer}
      id="app-sidebar"
      role={contentInert ? 'dialog' : 'complementary'}
      aria-modal={contentInert || undefined}
      aria-label={contentInert ? 'Navigation' : undefined}
      inert={drawerInert}
      class="border-sidebar-border bg-sidebar text-sidebar-ink fixed top-0 left-0 z-40 flex h-full w-60 flex-col border-r transition-transform duration-200 ease-out md:static md:z-auto md:w-50 md:shrink-0 md:translate-x-0 md:shadow-none {sidebarOpen
        ? 'translate-x-0 shadow-lg'
        : '-translate-x-full'}"
    >
      <div class="flex items-start gap-2 px-4 py-3">
        <a
          href="/"
          class="text-sidebar-ink-active hover:text-sidebar-ink-active flex items-start gap-2"
        >
          <!-- The m7kni house mark as shipped (small cut, stroke 4). Never
             CSS-filter it; it takes currentColor from the accent. -->
          <svg
            width="20"
            height="20"
            viewBox="0 0 72 72"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="butt"
            stroke-linejoin="miter"
            aria-hidden="true"
            class="text-accent mt-px shrink-0"
          >
            <rect x="9" y="25" width="38" height="38" rx="3"></rect>
            <path d="M28 25V63M9 44H47"></path>
            <rect x="49" y="7" width="14" height="14" rx="3"></rect>
          </svg>
          <span class="text-base leading-tight font-semibold">Paperless NGX Dedupe</span>
        </a>
        <button
          bind:this={closeButton}
          type="button"
          class="text-muted hover:text-ink ml-auto flex h-7 w-7 shrink-0 items-center justify-center md:hidden"
          onclick={() => void closeDrawer()}
          aria-label="Close navigation"
        >
          <XIcon size={16} />
        </button>
      </div>

      <nav aria-label="Primary" class="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        <div class="label-micro px-4 pb-1">Views</div>
        {#each items as item (item.href)}
          {@const active = isActive(item.href, page.url.pathname)}
          <a
            href={item.href}
            aria-current={active ? 'page' : undefined}
            class="flex items-center gap-2 border-l-2 px-4 py-2 text-base md:py-1.5 md:text-sm {active
              ? 'border-accent bg-sidebar-active text-sidebar-ink-active'
              : 'hover:bg-sidebar-hover text-sidebar-ink hover:text-sidebar-ink-active border-transparent'}"
          >
            <item.icon size={16} aria-hidden="true" class="shrink-0" />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>

      <div class="border-sidebar-border flex flex-col gap-2 border-t px-4 py-2.5">
        <ThemeToggle />
      </div>
    </div>

    <div class="contents" inert={contentInert}>
      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="border-border bg-surface flex items-center gap-3 border-b px-3 py-2.5 md:px-6"
        >
          <button
            bind:this={menuButton}
            type="button"
            class="border-border text-sidebar-ink hover:bg-canvas-deep flex h-8 w-8 shrink-0 items-center justify-center border md:hidden"
            onclick={() => void openDrawer()}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
          >
            <ListIcon size={16} />
          </button>
          <p class="text-muted truncate font-mono text-xs">{context}</p>
        </header>

        <main class="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-6">
          {#if data.readOnly}
            <div
              role="note"
              aria-label="Paperless read-only"
              class="border-border bg-surface text-ink mb-6 flex items-start gap-3 border px-4 py-3"
            >
              <span class="status-word text-warn" aria-hidden="true">◆</span>
              <div>
                <p class="font-medium">Paperless is read-only</p>
                <p class="text-muted mt-1 text-sm">
                  Changes to Paperless are disabled. Sync, analysis, AI suggestions and local review
                  remain available.
                </p>
              </div>
            </div>
          {/if}
          {@render children()}
        </main>
      </div>
      <ActivityPanel jobs={activity.jobs} />
      <ActivityLiveRegion jobs={activity.jobs} />
    </div>
  </div>
</IconContext>
