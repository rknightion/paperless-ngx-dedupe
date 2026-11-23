<script lang="ts">
  import type { DuplicateGroupMember } from '@paperless-dedupe/core';
  import { ConfidenceBadge, RichTooltip, ConfidenceTooltipContent, Spinner } from '$lib/components';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';

  interface GroupSummary {
    id: string;
    primaryDocumentTitle: string | null;
    primaryPaperlessId: number | null;
    confidenceScore: number;
    memberCount: number;
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
  }

  interface Props {
    group: GroupSummary;
    excluded: boolean;
    paperlessUrl: string;
    members: (DuplicateGroupMember & { thumbnailUrl?: string })[] | null;
    ontoggle: () => void;
    onpreview: () => void;
  }

  let { group, excluded, paperlessUrl, members, ontoggle, onpreview }: Props = $props();

  let primaryMember = $derived(members?.find((m) => m.isPrimary) ?? null);
  let secondaryMembers = $derived(
    members && primaryMember ? members.filter((m) => m.memberId !== primaryMember!.memberId) : [],
  );
  let firstSecondary = $derived(secondaryMembers[0] ?? null);
  let extraCount = $derived(secondaryMembers.length > 1 ? secondaryMembers.length - 1 : 0);

  let thumbErrorPrimary = $state(false);
  let thumbErrorSecondary = $state(false);

  function differs(a: unknown, b: unknown): boolean {
    if (a === null && b === null) return false;
    return a !== b;
  }

  interface MetaField {
    label: string;
    primaryValue: string;
    secondaryValue: string;
    isDifferent: boolean;
  }

  let metaFields: MetaField[] = $derived(
    primaryMember && firstSecondary
      ? [
          {
            label: 'Title',
            primaryValue: primaryMember.title,
            secondaryValue: firstSecondary.title,
            isDifferent: differs(primaryMember.title, firstSecondary.title),
          },
          {
            label: 'Correspondent',
            primaryValue: primaryMember.correspondent ?? '-',
            secondaryValue: firstSecondary.correspondent ?? '-',
            isDifferent: differs(primaryMember.correspondent, firstSecondary.correspondent),
          },
          {
            label: 'Document Type',
            primaryValue: primaryMember.documentType ?? '-',
            secondaryValue: firstSecondary.documentType ?? '-',
            isDifferent: differs(primaryMember.documentType, firstSecondary.documentType),
          },
        ]
      : [],
  );
</script>

<div class="border-soft bg-surface border p-4">
  <!-- Header row -->
  <div class="mb-3 flex items-center gap-3">
    <input
      type="checkbox"
      checked={!excluded}
      aria-label={`Include ${group.primaryDocumentTitle ?? 'untitled group'}`}
      onchange={ontoggle}
      class="accent-accent rounded-sm"
    />
    <span class="text-ink flex-1 truncate text-sm font-medium">
      {group.primaryDocumentTitle ?? 'Untitled'}
    </span>
    <a
      href="/duplicates/{group.id}"
      target="_blank"
      rel="noopener noreferrer"
      class="text-muted hover:text-accent shrink-0"
      title="Open full detail"
    >
      <ArrowSquareOutIcon class="h-4 w-4" />
    </a>
    <button onclick={onpreview} class="text-muted hover:text-accent shrink-0" title="Quick preview">
      <EyeIcon class="h-4 w-4" />
    </button>
    <RichTooltip position="left">
      <ConfidenceBadge score={group.confidenceScore} />
      {#snippet content()}
        <ConfidenceTooltipContent
          jaccardSimilarity={group.jaccardSimilarity}
          fuzzyTextRatio={group.fuzzyTextRatio}
          discriminativeScore={group.discriminativeScore}
        />
      {/snippet}
    </RichTooltip>
    <span class="text-muted font-mono text-xs tabular-nums">{group.memberCount} docs</span>
  </div>

  <!-- Thumbnail comparison area -->
  {#if !members}
    <!-- Loading state -->
    <div class="flex h-[350px] items-center justify-center">
      <Spinner label={null} class="text-accent" />
      <span class="text-muted ml-2 text-sm">Loading comparison...</span>
    </div>
  {:else if primaryMember && firstSecondary}
    <div class="grid grid-cols-2 gap-4">
      <!-- Primary -->
      <div>
        <div class="mb-2 flex items-center gap-2">
          <span class="text-ink text-xs font-semibold">Primary</span>
          <span class="status-word text-ink uppercase">
            <span aria-hidden="true">&#9632;</span>
            <span>Primary</span>
          </span>
          <a
            href="{paperlessUrl}/documents/{primaryMember.paperlessId}/details"
            target="_blank"
            rel="noopener noreferrer"
            class="text-muted hover:text-accent ml-auto"
            title="Open in Paperless-NGX"
          >
            <ArrowSquareOutIcon class="h-3.5 w-3.5" />
          </a>
        </div>
        {#if primaryMember.thumbnailUrl && !thumbErrorPrimary}
          <img
            src={primaryMember.thumbnailUrl}
            alt="Primary: {primaryMember.title}"
            class="border-soft h-[350px] w-full border object-contain"
            onerror={() => (thumbErrorPrimary = true)}
          />
        {:else}
          <div
            class="border-soft bg-canvas text-muted flex h-[350px] w-full items-center justify-center border"
          >
            <FileTextIcon class="h-8 w-8" />
          </div>
        {/if}
        <dl class="mt-2 space-y-1">
          {#each metaFields as field (field.label)}
            <div class="flex justify-between gap-2 text-xs">
              <dt class="text-muted">{field.label}</dt>
              <dd class="text-ink max-w-[60%] truncate text-right font-medium">
                {field.primaryValue}
              </dd>
            </div>
          {/each}
        </dl>
      </div>

      <!-- Secondary -->
      <div>
        <div class="mb-2 flex items-center gap-2">
          <span class="text-ink text-xs font-semibold">Compared</span>
          {#if extraCount > 0}
            <span class="text-muted font-mono text-xs tabular-nums">+{extraCount} more</span>
          {/if}
          <a
            href="{paperlessUrl}/documents/{firstSecondary.paperlessId}/details"
            target="_blank"
            rel="noopener noreferrer"
            class="text-muted hover:text-accent ml-auto"
            title="Open in Paperless-NGX"
          >
            <ArrowSquareOutIcon class="h-3.5 w-3.5" />
          </a>
        </div>
        {#if firstSecondary.thumbnailUrl && !thumbErrorSecondary}
          <img
            src={firstSecondary.thumbnailUrl}
            alt="Secondary: {firstSecondary.title}"
            class="border-soft h-[350px] w-full border object-contain"
            onerror={() => (thumbErrorSecondary = true)}
          />
        {:else}
          <div
            class="border-soft bg-canvas text-muted flex h-[350px] w-full items-center justify-center border"
          >
            <FileTextIcon class="h-8 w-8" />
          </div>
        {/if}
        <dl class="mt-2 space-y-1">
          {#each metaFields as field (field.label)}
            <div
              class="flex justify-between gap-2 text-xs {field.isDifferent
                ? 'border-l-warn -mx-1 border-l-2 px-1'
                : ''}"
            >
              <dt class={field.isDifferent ? 'text-ink' : 'text-muted'}>
                {#if field.isDifferent}<span class="text-warn font-mono">&ne;</span>{/if}
                {field.label}
              </dt>
              <dd class="text-ink max-w-[60%] truncate text-right font-medium">
                {field.secondaryValue}
              </dd>
            </div>
          {/each}
        </dl>
      </div>
    </div>
  {:else if primaryMember}
    <p class="text-muted py-4 text-center text-sm">Only one member — no comparison available.</p>
  {/if}
</div>
