<script lang="ts">
  let file = $state<File | null>(null);
  let backup = $state<string | null>(null);
  let busy = $state(false);
  let preview = $state(false);
  let error = $state('');
  let notice = $state('');

  async function submit(dryRun: boolean) {
    if (busy || !file) return;
    busy = true;
    error = '';
    notice = '';
    if (dryRun) preview = false;
    try {
      const body = dryRun ? await file.text() : backup;
      if (!body) throw new Error('No preview');
      const response = await fetch(`/api/v1/import/decisions?dryRun=${dryRun}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) {
        error =
          response.status === 409
            ? 'Another duplicate operation is running. Try again when it finishes.'
            : 'Could not import decisions. Check the file and try again.';
        return;
      }
      const { data } = await response.json();
      notice = `${dryRun ? 'Preview' : 'Imported'}: ${data.groupsMatched} groups matched, ${data.groupsUnmatched} groups unmatched, ${data.pairDecisionsAdded} new pair decisions.`;
      backup = dryRun ? body : null;
      preview = dryRun;
    } catch {
      error = 'Could not import decisions. Check the file and try again.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="border-soft mt-4 space-y-3 border-t pt-4" aria-label="Review decision backup">
  <h3 class="text-ink text-sm font-medium">Review decisions</h3>
  <p class="text-muted text-xs">
    Move review decisions within the same Paperless library. Preview before importing; this never
    modifies Paperless documents. Unmatched false-positive groups become remembered pairs for the
    next analysis. Groups over 200 members must match a pending group.
  </p>
  <a
    href="/api/v1/export/decisions.json"
    download
    class="border-soft text-ink hover:bg-canvas inline-block rounded-lg border px-4 py-2 text-sm font-medium"
  >
    Export decisions
  </a>
  <div class="flex flex-wrap items-center gap-3">
    <input
      type="file"
      accept=".json"
      aria-label="Review decisions file"
      disabled={busy}
      onchange={(event) => {
        file = event.currentTarget.files?.[0] ?? null;
        backup = null;
        preview = false;
        notice = '';
        error = '';
      }}
      class="text-ink file:border-soft file:text-ink w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:bg-transparent file:px-3 file:py-1.5"
    />
    <button
      type="button"
      disabled={!file || busy}
      onclick={() => submit(true)}
      class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      Preview decisions import
    </button>
    {#if preview}
      <button
        type="button"
        disabled={busy}
        onclick={() => submit(false)}
        class="bg-accent text-on-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Apply decisions import
      </button>
    {/if}
  </div>
  {#if notice}<p role="status" class="text-success text-sm">{notice}</p>{/if}
  {#if error}<p role="alert" class="text-ember text-sm">{error}</p>{/if}
</section>
