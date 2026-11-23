<script lang="ts">
  import type { DuplicateGroupMember } from '@paperless-dedupe/core';
  import { DocumentCompare, ConfidenceBadge, Spinner } from '$lib/components';

  interface Props {
    open: boolean;
    groupId: string;
    groupTitle: string;
    confidenceScore: number;
    paperlessUrl: string;
    onclose: () => void;
  }

  let { open, groupId, groupTitle, confidenceScore, paperlessUrl, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let loadState: 'idle' | 'loading' | 'loaded' | 'error' = $state('idle');
  let members: DuplicateGroupMember[] = $state([]);
  let errorMessage = $state('');
  let selectedSecondaryIndex = $state(0);

  let primaryMember = $derived(members.find((m) => m.isPrimary) || members[0]);
  let secondaryMembers = $derived(
    primaryMember ? members.filter((m) => m.memberId !== primaryMember.memberId) : [],
  );
  let selectedSecondary = $derived(secondaryMembers[selectedSecondaryIndex] || secondaryMembers[0]);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (loadState === 'idle') fetchMembers();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  // Reset state when groupId changes
  $effect(() => {
    void groupId;
    loadState = 'idle';
    members = [];
    selectedSecondaryIndex = 0;
  });

  async function fetchMembers() {
    loadState = 'loading';
    try {
      const res = await fetch(`/api/v1/duplicates/${groupId}?light=true`);
      if (!res.ok) throw new Error(`Failed to load group: ${res.status}`);
      const json = await res.json();
      members = json.data.members;
      loadState = 'loaded';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Unknown error';
      loadState = 'error';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
  class="border-border-hover bg-surface-raised rounded-overlay backdrop:bg-inverse/55 m-auto max-h-[85vh] max-w-5xl overflow-y-auto border p-0 shadow-lg"
  aria-labelledby="preview-modal-title"
>
  <div class="p-6">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 id="preview-modal-title" class="text-ink text-lg font-semibold">
          {groupTitle}
        </h2>
        <ConfidenceBadge score={confidenceScore} />
      </div>
      <div class="flex items-center gap-3">
        <a
          href="/duplicates/{groupId}"
          class="text-accent hover:text-accent-hover text-sm font-medium"
        >
          Open Full Detail &rarr;
        </a>
        <button onclick={onclose} class="text-muted hover:text-ink text-xl leading-none">
          &times;
        </button>
      </div>
    </div>

    {#if loadState === 'loading'}
      <div class="py-12 text-center">
        <Spinner label={null} class="text-accent" />
        <p class="text-muted mt-2 text-sm">Loading members...</p>
      </div>
    {:else if loadState === 'error'}
      <div class="border-ember bg-ember-light text-ember border px-4 py-3 text-sm">
        {errorMessage}
      </div>
    {:else if loadState === 'loaded' && primaryMember && selectedSecondary}
      <!-- Secondary member selector -->
      {#if secondaryMembers.length > 1}
        <div class="mb-4">
          {#if secondaryMembers.length <= 4}
            <div class="border-border flex w-fit max-w-full flex-wrap border">
              {#each secondaryMembers as sec, i (sec.documentId)}
                <button
                  onclick={() => {
                    selectedSecondaryIndex = i;
                  }}
                  class="border-border h-[26px] border-r px-3 text-sm last:border-r-0 {selectedSecondaryIndex ===
                  i
                    ? 'bg-selected text-ink font-medium'
                    : 'text-muted hover:bg-canvas-deep'}"
                >
                  {(sec.title ?? 'Untitled').length > 25
                    ? (sec.title ?? 'Untitled').slice(0, 25) + '...'
                    : (sec.title ?? 'Untitled')}
                </button>
              {/each}
            </div>
          {:else}
            <select
              value={selectedSecondaryIndex}
              onchange={(e) => {
                selectedSecondaryIndex = Number((e.target as HTMLSelectElement).value);
              }}
              class="border-border bg-surface-raised text-ink h-7 max-w-full rounded-sm border px-2 text-sm"
            >
              {#each secondaryMembers as sec, i (sec.documentId)}
                <option value={i}>{sec.title ?? 'Untitled'}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/if}

      <DocumentCompare primary={primaryMember} secondary={selectedSecondary} {paperlessUrl} />
    {:else if loadState === 'loaded'}
      <p class="text-muted text-sm">Not enough members to compare.</p>
    {/if}
  </div>
</dialog>
