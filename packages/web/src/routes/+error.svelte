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
  <title>{title} - Paperless NGX Dedupe</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
  <!-- Geometric illustration -->
  <svg class="mb-8 h-40 w-40" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Back document -->
    <rect
      x="40"
      y="20"
      width="80"
      height="100"
      rx="8"
      class="fill-muted/10 stroke-muted/30"
      stroke-width="2"
    />
    <!-- Front document -->
    <rect
      x="30"
      y="35"
      width="80"
      height="100"
      rx="8"
      class="fill-canvas stroke-muted/40"
      stroke-width="2"
    />
    <!-- Document lines -->
    <line
      x1="46"
      y1="60"
      x2="94"
      y2="60"
      class="stroke-muted/20"
      stroke-width="2"
      stroke-linecap="round"
    />
    <line
      x1="46"
      y1="72"
      x2="86"
      y2="72"
      class="stroke-muted/20"
      stroke-width="2"
      stroke-linecap="round"
    />
    <line
      x1="46"
      y1="84"
      x2="78"
      y2="84"
      class="stroke-muted/20"
      stroke-width="2"
      stroke-linecap="round"
    />
    <!-- Question mark -->
    <text
      x="80"
      y="125"
      text-anchor="middle"
      class="fill-accent"
      font-size="36"
      font-weight="600"
      font-family="system-ui, sans-serif">?</text
    >
  </svg>

  <p class="text-accent font-mono text-6xl font-semibold tracking-tighter">{status}</p>
  <h1 class="text-ink mt-4 text-2xl font-bold">{title}</h1>
  <p class="text-muted mt-2 max-w-sm text-sm leading-relaxed">{description}</p>
  {#if message && status !== 404}
    <p class="text-muted mt-1 max-w-sm text-xs">{message}</p>
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
