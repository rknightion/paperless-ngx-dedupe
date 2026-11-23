<script>
  import { page } from '$app/state';
  import { Button } from '$lib/components';

  let status = $derived(page.status);

  let title = $derived(
    status === 404 ? 'Page not found' : status === 500 ? 'Server error' : `Error ${status}`,
  );

  let description = $derived(
    status === 404
      ? 'The page you are looking for does not exist or has been moved. Go back, or open the dashboard.'
      : 'Something went wrong on our end. Try again in a moment, or go back to the dashboard.',
  );
</script>

<svelte:head>
  <title>{title} - Paperless NGX Dedupe</title>
</svelte:head>

<!-- Inline in the region that failed: a hairline in the ember tint, the status
     word, what failed, the fix, then the mono request detail. -->
<div class="flex min-h-[40vh] items-center justify-center">
  <div
    class="border-ember w-full max-w-xl border bg-[color-mix(in_oklab,var(--color-ember)_7%,var(--color-surface))] px-6 py-5"
    role="alert"
  >
    <p class="status-word text-ember">● FAIL</p>
    <h1 class="text-ink mt-2 text-lg font-semibold">{title}</h1>
    <p class="text-ink-light mt-1 text-base">{description}</p>
    <p class="text-muted mt-3 font-mono text-xs [overflow-wrap:anywhere]">
      {status} · {page.url.pathname}
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button href="/">Back to Dashboard</Button>
      <Button variant="outline" onclick={() => history.back()}>Go Back</Button>
    </div>
  </div>
</div>
