<script>
  import '../app.css';

  let { children } = $props();
</script>

<div class="flex min-h-screen">
  <aside class="fixed left-0 top-0 flex h-full w-64 flex-col bg-slate-900 text-white">
    <div class="p-6">
      <h1 class="text-xl font-bold">Paperless Dedupe</h1>
    </div>
    <nav class="flex flex-col gap-1 px-3">
      <a href="/" class="rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Dashboard
      </a>
      <a
        href="/documents"
        class="rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Documents
      </a>
      <a
        href="/duplicates"
        class="rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Duplicates
      </a>
      <a
        href="/settings"
        class="rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Settings
      </a>
    </nav>
  </aside>

  <main class="ml-64 min-h-screen flex-1 bg-gray-50 p-8">
    {@render children()}
  </main>
</div>
