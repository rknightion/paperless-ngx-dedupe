<script>
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message ?? 'An unexpected error occurred');

  let title = $derived(
    status === 404 ? 'Page Not Found' : status === 500 ? 'Server Error' : `Error ${status}`,
  );

  let description = $derived(
    status === 404
      ? 'The page you are looking for does not exist or has been moved.'
      : 'Something went wrong on our end. Please try again later.',
  );
</script>

<svelte:head>
  <title>{title} - Paperless Dedupe</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
  <p class="text-muted text-7xl font-bold">{status}</p>
  <h1 class="text-ink mt-4 text-2xl font-bold">{title}</h1>
  <p class="text-muted mt-2 max-w-md text-sm">{description}</p>
  {#if message && status !== 404}
    <p class="text-muted mt-1 max-w-md text-xs">{message}</p>
  {/if}
  <div class="mt-8 flex gap-3">
    <a
      href="/"
      class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
    >
      Back to Dashboard
    </a>
    <button
      onclick={() => history.back()}
      class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
    >
      Go Back
    </button>
  </div>
</div>
