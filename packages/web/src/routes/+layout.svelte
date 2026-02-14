<script>
  import '../app.css';
  import { page } from '$app/stores';

  let { children } = $props();
  let sidebarOpen = $state(false);

  $effect(() => {
    void $page.url.pathname;
    sidebarOpen = false;
  });
</script>

<div class="flex min-h-screen">
  <!-- Mobile overlay backdrop -->
  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-30 bg-black/40 md:hidden"
      onclick={() => (sidebarOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
      role="button"
      tabindex="-1"
    ></div>
  {/if}

  <aside
    class="bg-sidebar fixed top-0 left-0 z-40 flex h-full w-64 flex-col text-white transition-transform duration-200 ease-in-out {sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'} md:translate-x-0"
  >
    <div class="flex items-center justify-between p-6">
      <a href="/" class="flex items-center gap-3">
        <img src="/logo-icon.png" alt="" class="h-9 w-9 rounded-lg" />
        <span class="text-lg font-bold text-white">Paperless Dedupe</span>
      </a>
      <button
        class="text-white/70 hover:text-white md:hidden"
        onclick={() => (sidebarOpen = false)}
        aria-label="Close sidebar"
      >
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <nav class="flex flex-col gap-1 px-3">
      <a
        href="/"
        class="rounded-md px-3 py-2 text-sm font-medium text-white transition-colors {$page.url
          .pathname === '/'
          ? 'border-accent border-l-2 bg-sidebar-hover pl-2.5'
          : 'hover:bg-sidebar-hover'}"
      >
        Dashboard
      </a>
      <a
        href="/documents"
        class="rounded-md px-3 py-2 text-sm font-medium text-white transition-colors {$page.url.pathname.startsWith(
          '/documents',
        )
          ? 'border-accent border-l-2 bg-sidebar-hover pl-2.5'
          : 'hover:bg-sidebar-hover'}"
      >
        Documents
      </a>
      <a
        href="/duplicates"
        class="rounded-md px-3 py-2 text-sm font-medium text-white transition-colors {$page.url.pathname.startsWith(
          '/duplicates',
        )
          ? 'border-accent border-l-2 bg-sidebar-hover pl-2.5'
          : 'hover:bg-sidebar-hover'}"
      >
        Duplicates
      </a>
      <a
        href="/settings"
        class="rounded-md px-3 py-2 text-sm font-medium text-white transition-colors {$page.url.pathname.startsWith(
          '/settings',
        )
          ? 'border-accent border-l-2 bg-sidebar-hover pl-2.5'
          : 'hover:bg-sidebar-hover'}"
      >
        Settings
      </a>
    </nav>
  </aside>

  <main class="bg-canvas min-h-screen flex-1 p-4 sm:p-6 md:ml-64 md:p-8">
    <!-- Mobile hamburger -->
    <button
      class="text-ink mb-4 md:hidden"
      onclick={() => (sidebarOpen = true)}
      aria-label="Open sidebar"
    >
      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    {@render children()}
  </main>
</div>
