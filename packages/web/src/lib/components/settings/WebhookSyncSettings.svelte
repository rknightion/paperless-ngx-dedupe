<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from '$lib/components';
  import { type getWebhookSyncSettings } from '@paperless-dedupe/core';

  let {
    settings,
  }: {
    settings: ReturnType<typeof getWebhookSyncSettings> & { apiTokenConfigured: boolean };
  } = $props();
  const statusClasses = {
    success: "border-success text-success before:content-['■_']",
    error: "border-ember text-ember before:content-['●_']",
  } as const;
  const initial = untrack(() => settings);
  let enabled = $state(initial.enabled);
  let quietSeconds = $state<number | undefined>(initial.quietSeconds);
  let busy = $state(false);
  let status = $state<{ ok: boolean; message: string } | null>(null);

  async function save() {
    if (busy) return;
    busy = true;
    status = null;
    try {
      const response = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'automation.webhookSyncEnabled': enabled,
            'automation.webhookQuietSeconds': quietSeconds,
          },
        }),
      });
      if (!response.ok) throw new Error('Unable to save webhook preferences');
      status = { ok: true, message: 'Webhook preferences saved' };
    } catch {
      status = { ok: false, message: 'Unable to save webhook preferences. Try again.' };
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel mt-6" aria-label="Webhook sync">
  <h2 class="text-ink text-lg font-semibold">Webhook sync</h2>
  <p class="text-muted mt-1 text-sm">
    Sync after Paperless consumes documents. A burst waits until requests become quiet.
  </p>
  <p class="text-muted mt-3 text-sm">
    {#if settings.apiTokenConfigured}
      API token configured. Send it as a Bearer token in the Paperless webhook.
    {:else}
      Configure APP_API_TOKEN in the deployment environment and restart before using webhooks.
    {/if}
  </p>
  <a
    class="text-accent mt-2 inline-block text-sm underline"
    href="https://github.com/rknightion/paperless-ngx-dedupe/blob/main/docs/getting-started.md#trigger-on-consumption"
    target="_blank"
    rel="noopener noreferrer"
  >
    Workflow setup
  </a>
  <form
    class="mt-4 space-y-4"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <fieldset disabled={busy} class="space-y-4">
      <label class="text-ink flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={enabled} class="accent-accent" />
        Sync when Paperless sends a webhook
      </label>
      <label class="text-ink block text-sm" for="webhook-quiet-seconds">
        Quiet period (seconds)
      </label>
      <!-- Native input: TextField does not take this label wiring; same field metrics. -->
      <input
        id="webhook-quiet-seconds"
        type="number"
        min="10"
        max="3600"
        step="1"
        required
        bind:value={quietSeconds}
        class="border-border-hover bg-surface-raised text-ink w-full max-w-40 rounded-sm border px-3 py-1.5 font-mono text-sm tabular-nums"
      />
      <Button type="submit">
        {busy ? 'Saving...' : 'Save webhook preferences'}
      </Button>
    </fieldset>
    {#if status}
      <p
        role={status.ok ? 'status' : 'alert'}
        class="border-l-2 py-1 pl-3 text-sm {status.ok
          ? statusClasses.success
          : statusClasses.error}"
      >
        {status.message}
      </p>
    {/if}
  </form>
</section>
