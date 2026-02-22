<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    ConfidenceBadge,
    StatusBadge,
    ConfidenceBreakdown,
    DocumentCompare,
    TextDiff,
    GroupActionBar,
    DocumentVisualCompare,
  } from '$lib/components';
  import { ArrowLeft, ExternalLink } from 'lucide-svelte';

  let { data } = $props();

  let selectedSecondaryIndex = $state(0);
  let isSettingPrimary = $state(false);

  let primaryMember = $derived(
    data.group.members.find((m) => m.isPrimary) || data.group.members[0],
  );
  let secondaryMembers = $derived(
    data.group.members.filter((m) => m.memberId !== primaryMember.memberId),
  );
  let selectedSecondary = $derived(secondaryMembers[selectedSecondaryIndex] || secondaryMembers[0]);

  let groupStatus = $derived(data.group.status);

  async function setPrimary(documentId: string) {
    isSettingPrimary = true;
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
</script>

<svelte:head>
  <title>{primaryMember?.title ?? 'Duplicate Group'} - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Breadcrumb -->
  <a
    href="/duplicates"
    class="text-accent hover:text-accent-hover inline-flex items-center gap-1.5 text-sm"
  >
    <ArrowLeft class="h-4 w-4" /> Back to Duplicates
  </a>

  <!-- Group header -->
  <div>
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-ink text-2xl font-semibold tracking-tight">
        {primaryMember?.title || 'Untitled Group'}
      </h1>
      <ConfidenceBadge score={data.group.confidenceScore} />
      <StatusBadge status={groupStatus} />
    </div>
    <p class="text-muted mt-1 text-sm">
      Algorithm v{data.group.algorithmVersion}
      &middot; Created {new Date(data.group.createdAt).toLocaleDateString()}
      &middot; <span class="font-mono">{data.group.id.slice(0, 8)}&hellip;</span>
    </p>
  </div>

  <!-- Action bar -->
  <GroupActionBar
    groupId={data.group.id}
    status={data.group.status}
    memberCount={data.group.members.length}
    onaction={() => invalidateAll()}
  />

  <!-- Confidence section divider -->
  <div class="flex items-center gap-4">
    <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Confidence</span>
    <div class="divider flex-1"></div>
  </div>

  <!-- Confidence breakdown -->
  <ConfidenceBreakdown
    overallScore={data.group.confidenceScore}
    jaccardSimilarity={data.group.jaccardSimilarity}
    fuzzyTextRatio={data.group.fuzzyTextRatio}
    weights={data.weights}
  />

  <!-- Members section divider -->
  <div class="flex items-center gap-4">
    <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Members</span>
    <div class="divider flex-1"></div>
  </div>

  <!-- Members table -->
  <div class="panel">
    <div class="mb-4 flex items-center gap-3">
      <h3 class="text-ink text-base font-semibold">Members</h3>
      <span class="bg-canvas text-muted rounded-full px-2.5 py-0.5 text-xs font-semibold">
        {data.group.members.length}
      </span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-soft text-muted border-b text-left text-xs">
            <th class="pr-4 pb-2 font-medium">Title</th>
            <th class="hidden pr-4 pb-2 font-medium sm:table-cell">Correspondent</th>
            <th class="pr-4 pb-2 font-medium">Role</th>
            <th class="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.group.members as member (member.documentId)}
            <tr class="border-soft border-b last:border-0">
              <td class="text-ink py-2.5 pr-4 font-medium">{member.title}</td>
              <td class="text-muted hidden py-2.5 pr-4 sm:table-cell"
                >{member.correspondent ?? '-'}</td
              >
              <td class="py-2.5 pr-4">
                {#if member.isPrimary}
                  <span
                    class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    Primary
                  </span>
                {:else}
                  <span class="text-muted">-</span>
                {/if}
              </td>
              <td class="py-2.5">
                <div class="flex items-center gap-2">
                  {#if !member.isPrimary}
                    <button
                      onclick={() => setPrimary(member.documentId)}
                      disabled={isSettingPrimary}
                      class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      {isSettingPrimary ? 'Setting...' : 'Set as Primary'}
                    </button>
                  {/if}
                  <a
                    href="{data.paperlessUrl}/documents/{member.paperlessId}/details"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent hover:text-accent-hover"
                    title="Open in Paperless-NGX"
                  >
                    <ExternalLink class="h-4 w-4" />
                  </a>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Document comparison -->
  {#if selectedSecondary}
    <div class="space-y-4">
      <!-- Comparison section divider -->
      <div class="flex items-center gap-4">
        <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Comparison</span>
        <div class="divider flex-1"></div>
      </div>

      <h3 class="text-ink text-base font-semibold">Document Comparison</h3>

      {#if secondaryMembers.length > 1}
        {#if secondaryMembers.length <= 4}
          <div class="flex gap-1">
            {#each secondaryMembers as sec, i (sec.documentId)}
              <button
                onclick={() => {
                  selectedSecondaryIndex = i;
                }}
                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {selectedSecondaryIndex ===
                i
                  ? 'bg-accent text-white'
                  : 'border-soft text-muted hover:bg-canvas border'}"
              >
                {sec.title.length > 30 ? sec.title.slice(0, 30) + '...' : sec.title}
              </button>
            {/each}
          </div>
        {:else}
          <select
            value={selectedSecondaryIndex}
            onchange={(e) => {
              selectedSecondaryIndex = Number((e.target as HTMLSelectElement).value);
            }}
            class="border-soft bg-surface text-ink rounded-lg border px-3 py-2 text-sm"
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
      />

      {#key `${primaryMember.documentId}-${selectedSecondary.documentId}`}
        <TextDiff
          groupId={data.group.id}
          docAId={primaryMember.documentId}
          docBId={selectedSecondary.documentId}
          docAWordCount={primaryMember.content?.wordCount ?? null}
          docBWordCount={selectedSecondary.content?.wordCount ?? null}
        />
      {/key}

      <h3 class="text-ink text-base font-semibold">Visual Comparison</h3>
      {#key `${primaryMember.documentId}-${selectedSecondary.documentId}`}
        <DocumentVisualCompare primary={primaryMember} secondary={selectedSecondary} />
      {/key}
    </div>
  {/if}
</div>
