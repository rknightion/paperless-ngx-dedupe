<script>
  import '../app.css';
  import { page } from '$app/stores';

  let { children } = $props();
</script>

<div class="flex min-h-screen">
  <aside class="bg-sidebar fixed left-0 top-0 flex h-full w-64 flex-col text-white">
    <div class="p-6">
      <h1 class="text-xl font-bold">Paperless Dedupe</h1>
    </div>
    <nav class="flex flex-col gap-1 px-3">
      <a
        href="/"
        class="rounded-md px-3 py-2 text-sm font-medium text-white {$page.url.pathname === '/'
          ? 'bg-sidebar-hover'
          : 'hover:bg-sidebar-hover'}"
      >
        Dashboard
      </a>
      <a
        href="/documents"
        class="rounded-md px-3 py-2 text-sm font-medium text-white {$page.url.pathname.startsWith(
          '/documents',
        )
          ? 'bg-sidebar-hover'
          : 'hover:bg-sidebar-hover'}"
      >
        Documents
      </a>
      <a
        href="/duplicates"
        class="rounded-md px-3 py-2 text-sm font-medium text-white {$page.url.pathname.startsWith(
          '/duplicates',
        )
          ? 'bg-sidebar-hover'
          : 'hover:bg-sidebar-hover'}"
      >
        Duplicates
      </a>
      <a
        href="/settings"
        class="rounded-md px-3 py-2 text-sm font-medium text-white {$page.url.pathname.startsWith(
          '/settings',
        )
          ? 'bg-sidebar-hover'
          : 'hover:bg-sidebar-hover'}"
      >
        Settings
      </a>
    </nav>
  </aside>

  <main class="bg-canvas ml-64 min-h-screen flex-1 p-8">
    {@render children()}
  </main>
</div>
