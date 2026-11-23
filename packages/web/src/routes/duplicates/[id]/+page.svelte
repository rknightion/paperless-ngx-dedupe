<script lang="ts">
  import DuplicateKeyboardHandler from '$lib/components/duplicates/DuplicateKeyboardHandler.svelte';
  import { untrack } from 'svelte';
  import { type DuplicateGroupFiles } from '@paperless-dedupe/core';
  import { goto, invalidateAll } from '$app/navigation';
  import { browser } from '$app/env';
  import { page } from '$app/state';
  import {
    ConfidenceBadge,
    StatusBadge,
    ConfidenceBreakdown,
    DocumentCompare,
    TextDiff,
    GroupActionBar,
    DocumentVisualCompare,
    MatchExplanation,
  } from '$lib/components';
  import { ConfirmDialog, Button, Spinner } from '$lib/components';
  import ConfidenceLegend from '$lib/components/ui/ConfidenceLegend.svelte';
  import { trackGroupViewed, trackMemberAction } from '$lib/faro-events';
  import { safeDocumentReturnTarget } from '$lib/utils/safe-return';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import UserMinusIcon from 'phosphor-svelte/lib/UserMinusIcon';

  let { data } = $props();
  const readOnly = $derived(data.readOnly === true);

  let fileFacts = $state<DuplicateGroupFiles | null>(null);
  let fileError = $state(false);
  let fileRequest = $state(0);
  $effect(() => {
    const group = data.group;
    void fileRequest;
    const controller = new AbortController();
    fileFacts = null;
    fileError = false;
    void fetch(`/api/v1/duplicates/${encodeURIComponent(group.id)}/files`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('File metadata unavailable');
        const body = await response.json();
        if (!controller.signal.aborted) fileFacts = body.data;
      })
      .catch(() => {
        if (!controller.signal.aborted) fileError = true;
      });
    return () => controller.abort();
  });

  let selectedSecondaryIndex = $state(0);
  let isSettingPrimary = $state(false);
  let actionBar: HTMLDivElement | undefined = $state();
  function activateGroupAction(label: string) {
    const button = [...(actionBar?.querySelectorAll('button') ?? [])].find(
      (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === label,
    );
    if (button && !button.disabled) button.click();
  }

  let isDeleted = $derived(data.group.status === 'deleted');
  let primaryMember = $derived(
    data.group.members.find((m) => m.isPrimary) || data.group.members[0] || null,
  );
  let secondaryMembers = $derived(
    primaryMember ? data.group.members.filter((m) => m.memberId !== primaryMember!.memberId) : [],
  );
  let selectedSecondary = $derived(secondaryMembers[selectedSecondaryIndex] || secondaryMembers[0]);

  let groupStatus = $derived(data.group.status);
  let returnParams = $derived(page.url.searchParams.get('returnParams') ?? '');
  let documentReturnUrl = $derived(safeDocumentReturnTarget(page.url.searchParams.get('returnTo')));
  let returnUrl = $derived(
    documentReturnUrl ?? (returnParams ? `/duplicates?${returnParams}` : '/duplicates'),
  );

  let autoAdvance = $state(true);
  $effect(() => {
    if (!browser) return;
    try {
      autoAdvance = localStorage.getItem('pnd.review.autoAdvance') !== 'false';
    } catch {
      /* Keep the default when browser storage is unavailable. */
    }
  });

  function setAutoAdvance(value: boolean) {
    autoAdvance = value;
    try {
      localStorage.setItem('pnd.review.autoAdvance', String(value));
    } catch {
      /* The preference still applies to this page session. */
    }
  }

  async function goToNextGroup() {
    if (data.nextGroupId)
      await goto(
        `/duplicates/${data.nextGroupId}?returnParams=${encodeURIComponent(returnParams)}`,
      );
  }

  async function handleGroupAction() {
    const groupId = data.group.id;
    await invalidateAll();
    if (data.group.id !== groupId) return;
    if (
      autoAdvance &&
      (data.group.status === 'false_positive' || data.group.status === 'ignored')
    ) {
      await goToNextGroup();
    }
  }

  untrack(() =>
    trackGroupViewed({
      groupId: data.group.id,
      memberCount: data.group.members.length,
      confidenceScore: data.group.confidenceScore,
      status: data.group.status,
    }),
  );

  let isMemberAction = $state(false);
  let memberActionError = $state<string | null>(null);
  let showDeleteFromPaperless = $state(false);
  let showRemoveFromGroup = $state(false);

  async function setPrimary(documentId: string) {
    isSettingPrimary = true;
    trackMemberAction('set_primary', { groupId: data.group.id, memberId: documentId });
    try {
      await fetch(`/api/v1/duplicates/${data.group.id}/primary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      invalidateAll();
    } finally {
      isSettingPrimary = false;
    }
  }

  async function removeMember(memberId: string) {
    const res = await fetch(`/api/v1/duplicates/${data.group.id}/members/${memberId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? 'Failed to remove member');
    }
  }

  async function handleRemoveFromGroup() {
    if (!selectedSecondary) return;
    showRemoveFromGroup = false;
    isMemberAction = true;
    memberActionError = null;
    trackMemberAction('remove', { groupId: data.group.id, memberId: selectedSecondary.memberId });
    try {
      await removeMember(selectedSecondary.memberId);
      if (selectedSecondaryIndex >= secondaryMembers.length - 1 && selectedSecondaryIndex > 0) {
        selectedSecondaryIndex--;
      }
      await invalidateAll();
    } catch (e) {
      memberActionError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isMemberAction = false;
    }
  }

  async function handleDeleteFromPaperless() {
    if (readOnly) return;
    if (!selectedSecondary) return;
    showDeleteFromPaperless = false;
    isMemberAction = true;
    memberActionError = null;
    trackMemberAction('delete_from_paperless', {
      groupId: data.group.id,
      memberId: selectedSecondary.memberId,
    });
    try {
      // Delete from Paperless first
      const res = await fetch(`/api/v1/paperless/documents/${selectedSecondary.paperlessId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message ?? 'Failed to delete from Paperless');
      }
      // Clean up all groups that reference this document (not just the current one)
      const cleanupRes = await fetch('/api/v1/duplicates/cleanup-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedSecondary.documentId }),
      });
      if (!cleanupRes.ok) {
        // Fall back to single-group removal if cleanup endpoint fails
        await removeMember(selectedSecondary.memberId);
      }
      if (selectedSecondaryIndex >= secondaryMembers.length - 1 && selectedSecondaryIndex > 0) {
        selectedSecondaryIndex--;
      }
      await invalidateAll();
    } catch (e) {
      memberActionError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isMemberAction = false;
    }
  }
</script>

<svelte:head>
  <title
    >{primaryMember?.title ?? data.group.archivedPrimaryTitle ?? 'Duplicate Group'} - Paperless NGX Dedupe</title
  >
</svelte:head>

<div
  data-comparison-review
  class="comparison-review flex flex-col gap-3 md:gap-6 md:[reading-flow:flex-visual]"
>
  <header class="space-y-3 md:space-y-6">
    {@render groupHeading()}
  </header>

  <div class="comparison-content space-y-4 md:order-1 md:space-y-6">
    {@render reviewContent()}
  </div>

  <!-- Action bar -->
  <div bind:this={actionBar}>
    <GroupActionBar
      groupId={data.group.id}
      status={data.group.status}
      memberCount={data.group.members.length}
      onaction={() => void handleGroupAction()}
      {returnParams}
      {returnUrl}
    />
  </div>
</div>

{#snippet groupHeading()}
  <!-- Breadcrumb -->
  <div class="flex flex-wrap items-center gap-3">
    <a
      href={returnUrl}
      class="text-accent hover:text-accent-hover inline-flex items-center gap-1.5 text-sm font-medium"
    >
      <ArrowLeftIcon class="h-4 w-4" />
      {documentReturnUrl ? 'Back to Documents' : 'Back to Duplicates'}
    </a>
    {#if data.nextGroupId}<Button
        variant="secondary"
        size="sm"
        class="max-md:h-8"
        onclick={() => void goToNextGroup()}
      >
        Skip
      </Button>{/if}
  </div>
  <!-- Group header -->
  <div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1
        class="text-ink w-full text-lg font-semibold [overflow-wrap:anywhere] max-md:line-clamp-2 md:w-auto md:text-xl"
      >
        {primaryMember?.title || data.group.archivedPrimaryTitle || 'Untitled Group'}
      </h1>
      <ConfidenceBadge score={data.group.confidenceScore} />
      <StatusBadge status={groupStatus} />
    </div>
    <p class="text-muted mt-1 font-mono text-xs">
      Algorithm v{data.group.algorithmVersion}
      &middot; Created {new Date(data.group.createdAt).toLocaleDateString()}
      &middot; <span>{data.group.id.slice(0, 8)}&hellip;</span>
    </p>
    <div class="mt-2">
      <ConfidenceLegend />
    </div>
  </div>
  <!-- Confidence breakdown -->
  <ConfidenceBreakdown
    overallScore={data.group.confidenceScore}
    jaccardSimilarity={data.group.jaccardSimilarity}
    fuzzyTextRatio={data.group.fuzzyTextRatio}
    discriminativeScore={data.group.discriminativeScore}
    weights={data.weights}
    showLegend={false}
  />
{/snippet}

{#snippet reviewContent()}
  <label class="text-ink flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={autoAdvance}
      onchange={(event) => setAutoAdvance(event.currentTarget.checked)}
    />
    Go to next group after an action
  </label>
  {#if !data.nextGroupId && data.group.status !== 'pending'}
    <p class="text-muted text-sm">
      <span>Queue empty</span> ·
      <a class="text-accent underline" href={returnUrl}>Return to queue</a>
    </p>
  {/if}

  <DuplicateKeyboardHandler
    shortcutState={{
      pending: data.group.status === 'pending',
      canDelete: !readOnly,
      hasNext: Boolean(data.nextGroupId),
      secondaryCount: secondaryMembers.length,
      canSetPrimary: !isDeleted && !isSettingPrimary && Boolean(selectedSecondary),
    }}
    onaction={activateGroupAction}
    onselect={(index) => (selectedSecondaryIndex = index)}
    onprimary={() => {
      if (selectedSecondary && !isSettingPrimary && !isDeleted)
        void setPrimary(selectedSecondary.documentId);
    }}
    onskip={() => void goToNextGroup()}
  />

  {#snippet groupMembers()}
    <!-- Members table -->
    <div class="panel">
      <div class="mb-3 flex items-baseline gap-3">
        <h2 class="text-ink text-lg font-semibold">Members</h2>
        <span class="text-muted font-mono text-xs tabular-nums">{data.group.members.length}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-border-hover border-b text-left">
              <th scope="col" class="label-micro py-1.5 pr-4">Title</th>
              <th scope="col" class="label-micro hidden py-1.5 pr-4 sm:table-cell">
                Correspondent
              </th>
              <th scope="col" class="label-micro py-1.5 pr-4">Role</th>
              <th scope="col" class="label-micro py-1.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.group.members as member (member.documentId)}
              <tr class="border-soft border-b last:border-0">
                <td class="text-ink h-9 py-1.5 pr-4 font-medium [overflow-wrap:anywhere]">
                  {member.title}
                </td>
                <td class="text-muted hidden py-1.5 pr-4 [overflow-wrap:anywhere] sm:table-cell">
                  {member.correspondent ?? '-'}
                </td>
                <td class="py-1.5 pr-4">
                  {#if member.isPrimary}
                    <span class="status-word text-ink uppercase">
                      <span aria-hidden="true">&#9632;</span>
                      <span>Primary</span>
                    </span>
                  {:else}
                    <span class="text-muted">-</span>
                  {/if}
                </td>
                <td class="py-1.5">
                  <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    {#if !member.isPrimary}
                      <Button
                        variant="secondary"
                        size="sm"
                        class="max-md:h-8"
                        loading={isSettingPrimary}
                        onclick={() => setPrimary(member.documentId)}
                      >
                        {isSettingPrimary ? 'Setting...' : 'Set as Primary'}
                      </Button>
                    {/if}
                    <a
                      href="{data.paperlessUrl}/documents/{member.paperlessId}/details"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-accent hover:text-accent-hover"
                      title="Open in Paperless-NGX"
                    >
                      <ArrowSquareOutIcon class="h-4 w-4" />
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/snippet}

  {#if isDeleted}
    <!-- Archived group info -->
    <div class="flex items-center gap-4">
      <span class="label-micro">Archive</span>
      <div class="divider flex-1"></div>
    </div>

    <div class="border-soft bg-canvas border p-4">
      <p class="text-muted text-sm">
        This group was resolved{#if data.group.deletedAt}
          on {new Date(data.group.deletedAt).toLocaleDateString()}{/if}.
        {#if data.group.archivedMemberCount}
          {data.group.archivedMemberCount} documents were originally in this group.
        {/if}
        Member details are no longer available.
      </p>
    </div>
  {:else}
    <!-- Document comparison -->
    {#if selectedSecondary}
      <div class="space-y-4">
        <h2 class="text-ink text-lg font-semibold">Document Comparison</h2>
        {#if fileFacts?.identicalOriginals}
          <span
            class="border-border text-ink-light inline-flex w-fit border px-2 py-0.5 font-mono text-xs"
          >
            Byte-identical originals
          </span>
        {/if}
        {#if fileError}
          <p role="status" class="text-muted text-sm">
            File metadata is unavailable.
            <button class="text-accent underline" onclick={() => fileRequest++}>
              Retry file metadata
            </button>
          </p>
        {:else if !fileFacts}
          <p role="status" class="text-muted text-sm">Loading file metadata…</p>
        {/if}

        {#if secondaryMembers.length > 1}
          {#if secondaryMembers.length <= 4}
            <div class="border-border flex w-fit max-w-full flex-wrap border">
              {#each secondaryMembers as sec, i (sec.documentId)}
                <button
                  onclick={() => {
                    selectedSecondaryIndex = i;
                  }}
                  aria-pressed={selectedSecondaryIndex === i}
                  title={sec.title}
                  class="border-border h-[26px] max-w-full truncate border-r px-3 text-sm last:border-r-0 max-md:h-8 {selectedSecondaryIndex ===
                  i
                    ? 'bg-selected text-ink font-medium'
                    : 'text-muted hover:bg-canvas-deep'}"
                >
                  {sec.title.length > 30 ? sec.title.slice(0, 30) + '...' : sec.title}
                </button>
              {/each}
            </div>
          {:else}
            <select
              aria-label="Comparison document"
              value={selectedSecondaryIndex}
              onchange={(e) => {
                selectedSecondaryIndex = Number((e.target as HTMLSelectElement).value);
              }}
              class="border-border bg-surface-raised text-ink h-7 max-w-full rounded-sm border px-2 text-sm max-md:h-8"
            >
              {#each secondaryMembers as sec, i (sec.documentId)}
                <option value={i}>{sec.title}</option>
              {/each}
            </select>
          {/if}
        {/if}

        <DocumentCompare
          primary={primaryMember}
          secondary={selectedSecondary}
          paperlessUrl={data.paperlessUrl}
          primaryFile={fileFacts?.members.find(
            (member) => member.documentId === primaryMember.documentId,
          )}
          secondaryFile={fileFacts?.members.find(
            (member) => member.documentId === selectedSecondary.documentId,
          )}
        />

        <MatchExplanation
          explanation={data.group.matchExplanation}
          comparisonDocumentId={selectedSecondary.documentId}
          primaryTitle={primaryMember.title}
          comparisonTitle={selectedSecondary.title}
        />

        <!-- Per-document actions -->
        {#if groupStatus !== 'deleted'}
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted text-xs">
              Actions for <strong class="text-ink">
                {selectedSecondary.title.length > 40
                  ? selectedSecondary.title.slice(0, 40) + '...'
                  : selectedSecondary.title}
              </strong>:
            </span>
            <Button
              variant="secondary"
              size="sm"
              class="max-md:h-8"
              icon={UserMinusIcon}
              disabled={isMemberAction}
              onclick={() => (showRemoveFromGroup = true)}
            >
              Remove from Group
            </Button>
            <Button
              variant="destructive"
              size="sm"
              class="max-md:h-8"
              icon={TrashIcon}
              disabled={readOnly || isMemberAction}
              title={readOnly ? 'Paperless is read-only' : undefined}
              onclick={() => (showDeleteFromPaperless = true)}
            >
              Delete from Paperless
            </Button>
            {#if isMemberAction}
              <Spinner size="sm" class="text-accent" />
            {/if}
            {#if memberActionError}
              <span class="text-ember text-xs">{memberActionError}</span>
            {/if}
          </div>
        {/if}

        {#key `${primaryMember.documentId}-${selectedSecondary.documentId}`}
          <TextDiff
            groupId={data.group.id}
            docAId={primaryMember.documentId}
            docBId={selectedSecondary.documentId}
            docAWordCount={primaryMember.content?.wordCount ?? null}
            docBWordCount={selectedSecondary.content?.wordCount ?? null}
          />
        {/key}

        <h3 class="text-ink text-lg font-semibold">Visual Comparison</h3>
        {#key `${primaryMember.documentId}-${selectedSecondary.documentId}`}
          <DocumentVisualCompare
            primary={primaryMember}
            secondary={selectedSecondary}
            primaryMedia={data.mediaByDocumentId[primaryMember.documentId]}
            secondaryMedia={data.mediaByDocumentId[selectedSecondary.documentId]}
            secondaryIndex={selectedSecondaryIndex}
            secondaryCount={secondaryMembers.length}
            onnavigate={(i) => {
              selectedSecondaryIndex = i;
            }}
          />
        {/key}
      </div>
    {/if}
    {@render groupMembers()}
  {/if}
{/snippet}

<ConfirmDialog
  open={showRemoveFromGroup}
  title="Remove from Group"
  message="This will remove the document from this duplicate group. The document will remain in Paperless-NGX."
  confirmLabel="Remove"
  variant="accent"
  onconfirm={handleRemoveFromGroup}
  oncancel={() => (showRemoveFromGroup = false)}
/>

<ConfirmDialog
  open={showDeleteFromPaperless}
  title="Delete from Paperless"
  message="This will delete the document from Paperless-NGX (moved to recycle bin) and remove it from this group. This can be undone from the Paperless-NGX recycle bin."
  confirmLabel="Delete Document"
  variant="ember"
  confirmDisabled={readOnly}
  onconfirm={handleDeleteFromPaperless}
  oncancel={() => (showDeleteFromPaperless = false)}
/>

<style>
  /* On short screens the whole page can scroll, so the pinned regions cannot crowd out review. */
  @media (width < 48rem) and (height >= 36rem) {
    :global(main:has(> [data-comparison-review])) {
      display: flex;
      flex-direction: column;
    }

    :global(main:has(> [data-comparison-review]) > [role='note']) {
      flex-shrink: 0;
    }

    .comparison-review {
      min-height: 0;
      flex: 1;
    }

    .comparison-content {
      /* Keep the shell scrollable if pinned content leaves too little room. */
      min-height: 10rem;
      flex: 1;
      overflow-y: auto;
      /* Room for focus outlines inside the clipped scroll region. */
      padding: 4px;
    }
  }
</style>
