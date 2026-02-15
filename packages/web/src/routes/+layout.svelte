<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { LayoutDashboard, FileText, Copy, Settings, X, Menu } from 'lucide-svelte';

  let { children } = $props();
  let sidebarOpen = $state(false);

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
    class="fixed top-0 left-0 z-40 flex h-full w-64 flex-col text-white transition-transform duration-200 ease-in-out {sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'} md:translate-x-0"
    style="background: linear-gradient(180deg, oklch(0.22 0.03 260) 0%, oklch(0.18 0.025 260) 100%)"
  >
    <div class="flex items-center justify-between p-6">
      <a href="/" class="flex items-center gap-3">
        <img src="/logo-icon.png" alt="" class="h-9 w-9 rounded-lg" />
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
      <a
        href="/"
        class="px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname === '/'
          ? 'bg-sidebar-active rounded-lg text-white'
          : 'hover:bg-sidebar-hover rounded-lg text-white/70 hover:text-white'}"
      >
        <span class="flex items-center gap-3">
          <LayoutDashboard class="h-4 w-4" />
          Dashboard
        </span>
      </a>
      <a
        href="/documents"
        class="px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith(
          '/documents',
        )
          ? 'bg-sidebar-active rounded-lg text-white'
          : 'hover:bg-sidebar-hover rounded-lg text-white/70 hover:text-white'}"
      >
        <span class="flex items-center gap-3">
          <FileText class="h-4 w-4" />
          Documents
        </span>
      </a>
      <a
        href="/duplicates"
        class="px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith(
          '/duplicates',
        )
          ? 'bg-sidebar-active rounded-lg text-white'
          : 'hover:bg-sidebar-hover rounded-lg text-white/70 hover:text-white'}"
      >
        <span class="flex items-center gap-3">
          <Copy class="h-4 w-4" />
          Duplicates
        </span>
      </a>
      <a
        href="/settings"
        class="px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith(
          '/settings',
        )
          ? 'bg-sidebar-active rounded-lg text-white'
          : 'hover:bg-sidebar-hover rounded-lg text-white/70 hover:text-white'}"
      >
        <span class="flex items-center gap-3">
          <Settings class="h-4 w-4" />
          Settings
        </span>
      </a>
    </nav>
    <div class="mt-auto px-6 pb-6">
      <p class="text-xs text-white/40">Paperless NGX Dedupe</p>
    </div>
  </aside>

  <main class="bg-canvas min-h-screen flex-1 p-4 sm:p-6 md:ml-64 md:p-8">
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
</div>
