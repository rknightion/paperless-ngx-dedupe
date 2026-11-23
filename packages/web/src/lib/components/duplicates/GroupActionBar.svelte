<script lang="ts">
  import {
    deletionRunFromCompletion,
    type UndoDeletionRun,
  } from '$lib/components/duplicates/UndoDeletion.svelte';
  let deletionRun = $state<UndoDeletionRun | null>(null);
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Button, Checkbox, ConfirmDialog, RecycleBinPrompt } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';
  import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
  import { type FrozenDuplicateGroup } from '@paperless-dedupe/core';
  import MetadataMergePreview from './MetadataMergePreview.svelte';

  const readOnly = $derived(page.data.readOnly === true);

  interface Props {
    groupId: string;
    status: string;
    memberCount: number;
    onaction?: () => void;
    returnParams?: string;
    returnUrl?: string;
  }

  let {
    groupId,
    status,
    memberCount,
    onaction,
    returnParams = '',
    returnUrl = '',
  }: Props = $props();

  let returnHref = $derived(
    returnUrl || (returnParams ? `/duplicates?${returnParams}` : '/duplicates'),
  );

  let isUpdating = $state(false);
  let error = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let mergeMetadata = $state(false);
  let mergePreview = $state<FrozenDuplicateGroup['merge'] | null>(null);
  let mergePlanToken = $state<string | null>(null);
  let mergeLoading = $state(false);
  let mergeError = $state<string | null>(null);
  let mergeGeneration = 0;
  let deleteProgress = $state<{ progress: number; message: string } | null>(null);
  let showRecycleBinPrompt = $state(false);

  async function previewMerge(enabled: boolean) {
    mergeMetadata = enabled;
    mergePreview = null;
    mergePlanToken = null;
    mergeError = null;
    const generation = ++mergeGeneration;
    mergeLoading = enabled;
    if (!enabled) return;
    const selectedGroup = groupId;
    try {
      const response = await fetch('/api/v1/batch/delete-non-primary/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: [selectedGroup], mergeMetadata: true }),
      });
      const body = await response.json();
      if (generation !== mergeGeneration || !showDeleteConfirm || selectedGroup !== groupId) return;
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to preview metadata');
      mergePreview = body.data.groups[0].merge;
      mergePlanToken = body.data.planToken;
    } catch (error) {
      if (generation === mergeGeneration)
        mergeError = error instanceof Error ? error.message : 'Unable to preview metadata';
    } finally {
      if (generation === mergeGeneration) mergeLoading = false;
    }
  }

  async function setStatus(newStatus: string) {
    isUpdating = true;
    error = null;
    try {
      const res = await fetch(`/api/v1/duplicates/${groupId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      onaction?.();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isUpdating = false;
    }
  }

  async function deleteNonPrimary() {
    if (readOnly) return;
    if (mergeMetadata && (mergeLoading || !mergePlanToken || mergeError)) return;
    showDeleteConfirm = false;
    isUpdating = true;
    error = null;
    try {
      const res = await fetch('/api/v1/batch/delete-non-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mergeMetadata
            ? { planToken: mergePlanToken, confirm: true }
            : { groupIds: [groupId], confirm: true },
        ),
      });
      if (!res.ok) throw new Error('Failed to start delete operation');

      const json = await res.json();
      const jobId = json.data?.jobId;
      if (jobId) {
        deleteProgress = { progress: 0, message: 'Starting...' };
        connectJobSSE(jobId, {
          onProgress: (data) => {
            deleteProgress = { progress: data.progress, message: data.message ?? '' };
          },
          onComplete: (event) => {
            deletionRun = deletionRunFromCompletion(event);
            deleteProgress = null;
            isUpdating = false;
            showRecycleBinPrompt = true;
          },
          onError: () => {
            deleteProgress = null;
            isUpdating = false;
            error = 'Delete operation failed';
          },
        });
      } else {
        isUpdating = false;
        onaction?.();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      isUpdating = false;
    }
  }
</script>

<div
  class="panel flex flex-wrap items-center gap-3 {status === 'pending'
    ? 'border-accent bg-accent-subtle border-2'
    : 'bg-canvas'}"
>
  {#if status === 'pending'}
    <Button
      variant="outline"
      icon={XCircleIcon}
      onclick={() => setStatus('false_positive')}
      disabled={isUpdating}
    >
      Not a Duplicate
    </Button>

    <Button icon={CheckCircleIcon} onclick={() => setStatus('ignored')} disabled={isUpdating}>
      Keep All
    </Button>

    <Button
      variant="destructive"
      icon={TrashIcon}
      onclick={() => {
        void previewMerge(false);
        showDeleteConfirm = true;
      }}
      disabled={readOnly || isUpdating || memberCount < 2}
      title={readOnly ? 'Paperless is read-only' : undefined}
    >
      Delete Duplicates
    </Button>
  {:else if status === 'deleted'}
    <p class="text-muted text-sm">
      This group has been resolved — documents were deleted from Paperless-NGX.
    </p>
  {:else}
    <Button
      variant="outline"
      icon={ArrowCounterClockwiseIcon}
      onclick={() => setStatus('pending')}
      disabled={isUpdating}
    >
      Reopen
    </Button>
  {/if}

  {#if deleteProgress}
    <div class="text-muted flex items-center gap-2 text-sm">
      <span
        class="border-accent inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
      ></span>
      {deleteProgress.message || `${Math.round(deleteProgress.progress * 100)}%`}
    </div>
  {/if}

  {#if error}
    <span class="text-ember text-sm">{error}</span>
  {/if}
</div>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Non-Primary Documents"
  message="This will delete all non-primary documents in this group from Paperless-NGX. Documents are moved to the Paperless-NGX recycle bin and can be restored from there."
  confirmLabel="Delete Documents"
  variant="ember"
  confirmDisabled={readOnly || (mergeMetadata && (mergeLoading || !mergePlanToken || !!mergeError))}
  onconfirm={deleteNonPrimary}
  oncancel={() => {
    showDeleteConfirm = false;
  }}
>
  <div class="mt-4">
    <Checkbox
      checked={mergeMetadata}
      disabled={mergeLoading}
      label="Copy missing tags and metadata to the kept document"
      onchange={(checked) => previewMerge(checked)}
    />
    {#if mergeLoading}
      <p class="text-muted mt-2 text-sm">Preparing metadata preview…</p>
    {:else if mergeError}
      <p role="alert" class="text-ember mt-2 text-sm">{mergeError}</p>
    {:else if mergePreview}
      <MetadataMergePreview merge={mergePreview} />
    {/if}
  </div>
</ConfirmDialog>

{#if showRecycleBinPrompt}
  <dialog
    open
    onclick={(e) => {
      if (e.target === e.currentTarget) goto(returnHref);
    }}
    class="border-soft bg-surface fixed inset-0 z-50 m-auto max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/40"
  >
    <h2 class="text-ink text-lg font-semibold">Delete Complete</h2>
    <RecycleBinPrompt {deletionRun} onclose={() => goto(returnHref)} />
  </dialog>
{/if}
