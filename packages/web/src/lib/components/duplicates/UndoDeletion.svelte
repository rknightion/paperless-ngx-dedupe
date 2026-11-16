<script module lang="ts">
  import { type JobCompletion } from '$lib/sse';
  export interface UndoDeletionRun {
    planId: string;
    documentsDeleted: number;
    groupCount: number;
  }
  export function deletionRunFromCompletion(event: JobCompletion): UndoDeletionRun | null {
    if (event.status !== 'completed' || !event.planId) return null;
    return {
      planId: event.planId,
      documentsDeleted: (event.deletedDocuments ?? 0) - (event.alreadyMissingDocuments ?? 0),
      groupCount: event.deletedGroups ?? 0,
    };
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { Button, ConfirmDialog } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';

  let { run }: { run: UndoDeletionRun } = $props();
  const readOnly = $derived(page.data.readOnly === true);
  let confirming = $state(false);
  let busy = $state(false);
  let feedback = $state<{ ok: boolean; message: string } | null>(null);
  let stream: ReturnType<typeof connectJobSSE> | undefined;
  onDestroy(() => stream?.close());

  async function restore() {
    if (readOnly || busy) return;
    confirming = false;
    busy = true;
    feedback = null;
    try {
      const response = await fetch(
        `/api/v1/batch/deletions/${encodeURIComponent(run.planId)}/restore`,
        { method: 'POST' },
      );
      if (!response.ok) {
        feedback = {
          ok: false,
          message:
            response.status === 409
              ? 'A document operation is already running. Try again after it finishes.'
              : 'Unable to start restore. Try again.',
        };
        busy = false;
        return;
      }
      const body = await response.json();
      stream = connectJobSSE(body.data.jobId, {
        onComplete: async (event) => {
          busy = false;
          if (event.status !== 'completed') {
            feedback = {
              ok: false,
              message: 'Restore did not complete. Check Jobs before retrying.',
            };
            return;
          }
          const restored = event.restored ?? 0,
            missing = event.notRestorable ?? 0;
          feedback = {
            ok: true,
            message:
              restored === 0
                ? `Nothing to restore. ${missing} ${missing === 1 ? 'document is' : 'documents are'} no longer in the recycle bin.`
                : `Restored ${restored} document${restored === 1 ? '' : 's'}. ${missing} not restorable.`,
          };
          await invalidateAll();
        },
        onError: () => {
          busy = false;
          feedback = {
            ok: false,
            message: 'Unable to follow restore progress. Check Jobs before retrying.',
          };
        },
      });
    } catch {
      busy = false;
      feedback = { ok: false, message: 'Unable to start restore. Try again.' };
    }
  }
</script>

<div class="space-y-2">
  <Button
    variant="secondary"
    size="sm"
    disabled={readOnly || busy}
    title={readOnly ? 'Paperless is read-only' : undefined}
    onclick={() => (confirming = true)}>{busy ? 'Restoring...' : 'Undo'}</Button
  >
  {#if feedback}<p
      role={feedback.ok ? 'status' : 'alert'}
      class={feedback.ok ? 'text-success text-sm' : 'text-ember text-sm'}
    >
      {feedback.message}
    </p>{/if}
</div>
<ConfirmDialog
  open={confirming}
  title="Restore deletion run"
  message="Restore up to {run.documentsDeleted} document{run.documentsDeleted === 1
    ? ''
    : 's'} from this entire deletion run ({run.groupCount} {run.groupCount === 1
    ? 'group'
    : 'groups'})? Archived groups stay deleted. Documents no longer in the recycle bin cannot be restored."
  confirmLabel="Restore documents"
  variant="accent"
  confirmDisabled={readOnly || busy}
  onconfirm={() => void restore()}
  oncancel={() => (confirming = false)}
/>
