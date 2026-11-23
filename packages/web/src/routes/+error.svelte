<script>
  import { page } from '$app/state';
  import { Button } from '$lib/components';

  let status = $derived(page.status);
  let path = $derived(page.url.pathname);

  let title = $derived(
    status === 404 ? 'Page not found' : status === 500 ? 'Server error' : `Error ${status}`,
  );

  let description = $derived(
    status === 404
      ? 'The page you are looking for does not exist or has been moved. Go back, or open the dashboard.'
      : 'Something went wrong on our end. Try again in a moment, or open the dashboard.',
  );
</script>

<svelte:head>
  <title>{title} - Paperless NGX Dedupe</title>
</svelte:head>

<div class="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center">
  <section class="border-ember bg-ember-light/50 border p-6" role="alert">
    <p class="status-word text-ember">● FAIL</p>
    <h1 class="text-ink mt-2 text-xl font-semibold">{title}</h1>
    <p class="text-ink-light mt-2 text-sm">{description}</p>
    <p class="text-muted mt-3 font-mono text-xs">GET {path} · {status}</p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button href="/">Back to dashboard</Button>
      <Button variant="outline" onclick={() => history.back()}>Go back</Button>
    </div>
  </section>
</div>
