<script lang="ts">
  import type { DuplicateGroupMember } from '@paperless-dedupe/core';
  import { formatBytes } from '$lib/utils/format';

  interface Props {
    primary: DuplicateGroupMember;
    secondary: DuplicateGroupMember;
    paperlessUrl: string;
  }

  let { primary, secondary, paperlessUrl }: Props = $props();

  function formatDate(date: string | null): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  }

  function differs(a: unknown, b: unknown): boolean {
    if (a === null && b === null) return false;
    if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b);
    return a !== b;
  }

  interface CompareField {
    label: string;
    primaryValue: string;
    secondaryValue: string;
    isDifferent: boolean;
  }

  let fields: CompareField[] = $derived([
    {
      label: 'Title',
      primaryValue: primary.title,
      secondaryValue: secondary.title,
      isDifferent: differs(primary.title, secondary.title),
    },
    {
      label: 'Correspondent',
      primaryValue: primary.correspondent ?? '-',
      secondaryValue: secondary.correspondent ?? '-',
      isDifferent: differs(primary.correspondent, secondary.correspondent),
    },
    {
      label: 'Document Type',
      primaryValue: primary.documentType ?? '-',
      secondaryValue: secondary.documentType ?? '-',
      isDifferent: differs(primary.documentType, secondary.documentType),
    },
    {
      label: 'Created Date',
      primaryValue: formatDate(primary.createdDate),
      secondaryValue: formatDate(secondary.createdDate),
      isDifferent: differs(primary.createdDate, secondary.createdDate),
    },
    {
      label: 'Original File Size',
      primaryValue: primary.originalFileSize ? formatBytes(primary.originalFileSize) : '-',
      secondaryValue: secondary.originalFileSize ? formatBytes(secondary.originalFileSize) : '-',
      isDifferent: differs(primary.originalFileSize, secondary.originalFileSize),
    },
    {
      label: 'Archive File Size',
      primaryValue: primary.archiveFileSize ? formatBytes(primary.archiveFileSize) : '-',
      secondaryValue: secondary.archiveFileSize ? formatBytes(secondary.archiveFileSize) : '-',
      isDifferent: differs(primary.archiveFileSize, secondary.archiveFileSize),
    },
    {
      label: 'Word Count',
      primaryValue: primary.content?.wordCount?.toLocaleString() ?? '-',
      secondaryValue: secondary.content?.wordCount?.toLocaleString() ?? '-',
      isDifferent: differs(primary.content?.wordCount, secondary.content?.wordCount),
    },
  ]);
</script>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Primary -->
  <div class="panel">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h4 class="text-ink text-sm font-semibold">Primary Document</h4>
        <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium"
          >Primary</span
        >
      </div>
      <a
        href="{paperlessUrl}/documents/{primary.paperlessId}/details"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent hover:text-accent-hover text-sm"
        title="Open in Paperless-NGX"
      >
        &#8599;
      </a>
    </div>
    <dl class="space-y-2">
      {#each fields as field (field.label)}
        <div class="border-soft flex justify-between border-b py-1.5 text-sm last:border-0">
          <dt class="text-muted">{field.label}</dt>
          <dd class="text-ink font-medium">{field.primaryValue}</dd>
        </div>
      {/each}
    </dl>
    {#if primary.tags.length > 0}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each primary.tags as tag (tag)}
          <span class="bg-canvas text-muted rounded-full px-2 py-0.5 text-xs">{tag}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Secondary -->
  <div class="panel">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-ink text-sm font-semibold">Compared Document</h4>
      <a
        href="{paperlessUrl}/documents/{secondary.paperlessId}/details"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent hover:text-accent-hover text-sm"
        title="Open in Paperless-NGX"
      >
        &#8599;
      </a>
    </div>
    <dl class="space-y-2">
      {#each fields as field (field.label)}
        <div
          class="border-soft flex justify-between border-b py-1.5 text-sm last:border-0 {field.isDifferent
            ? 'rounded bg-amber-50'
            : ''}"
        >
          <dt class="text-muted">{field.label}</dt>
          <dd class="text-ink font-medium">{field.secondaryValue}</dd>
        </div>
      {/each}
    </dl>
    {#if secondary.tags.length > 0}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each secondary.tags as tag (tag)}
          <span
            class="bg-canvas text-muted rounded-full px-2 py-0.5 text-xs {!primary.tags.includes(
              tag,
            )
              ? 'ring-1 ring-amber-300'
              : ''}">{tag}</span
          >
        {/each}
      </div>
    {/if}
  </div>
</div>
