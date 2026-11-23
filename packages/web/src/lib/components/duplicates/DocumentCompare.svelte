<script lang="ts">
  import type { DuplicateGroupMember, PaperlessFileMetadata } from '@paperless-dedupe/core';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';

  interface Props {
    primary: DuplicateGroupMember;
    secondary: DuplicateGroupMember;
    paperlessUrl: string;
    primaryFile?: PaperlessFileMetadata;
    secondaryFile?: PaperlessFileMetadata;
  }

  let { primary, secondary, paperlessUrl, primaryFile, secondaryFile }: Props = $props();

  function fileSize(value: number | null | undefined): string {
    return value == null ? 'Unknown' : `${value.toLocaleString()} bytes`;
  }

  function archiveSize(file: PaperlessFileMetadata | undefined): string {
    return file?.hasArchive === false ? 'No archive' : fileSize(file?.archiveSize);
  }

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
      label: 'Original File Name',
      primaryValue: primary.originalFileName ?? '-',
      secondaryValue: secondary.originalFileName ?? '-',
      isDifferent: differs(primary.originalFileName, secondary.originalFileName),
    },
    {
      label: 'Archive Serial Number',
      primaryValue: primary.archiveSerialNumber?.toLocaleString() ?? '-',
      secondaryValue: secondary.archiveSerialNumber?.toLocaleString() ?? '-',
      isDifferent: differs(primary.archiveSerialNumber, secondary.archiveSerialNumber),
    },
    {
      label: 'Page Count',
      primaryValue: primary.pageCount?.toLocaleString() ?? '-',
      secondaryValue: secondary.pageCount?.toLocaleString() ?? '-',
      isDifferent: differs(primary.pageCount, secondary.pageCount),
    },
    {
      label: 'MIME Type',
      primaryValue: primary.mimeType ?? '-',
      secondaryValue: secondary.mimeType ?? '-',
      isDifferent: differs(primary.mimeType, secondary.mimeType),
    },
    {
      label: 'Original Size',
      primaryValue: fileSize(primaryFile?.originalSize),
      secondaryValue: fileSize(secondaryFile?.originalSize),
      isDifferent: differs(primaryFile?.originalSize, secondaryFile?.originalSize),
    },
    {
      label: 'Archive Size',
      primaryValue: archiveSize(primaryFile),
      secondaryValue: archiveSize(secondaryFile),
      isDifferent: archiveSize(primaryFile) !== archiveSize(secondaryFile),
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
        <h4 class="text-ink text-lg font-semibold">Primary Document</h4>
        <span class="status-word text-ink uppercase">
          <span aria-hidden="true">&#9632;</span>
          <span>Primary</span>
        </span>
      </div>
      <a
        href="{paperlessUrl}/documents/{primary.paperlessId}/details"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent hover:text-accent-hover text-sm"
        title="Open in Paperless-NGX"
      >
        <ArrowSquareOutIcon class="h-4 w-4" />
      </a>
    </div>
    <dl class="space-y-2">
      {#each fields as field (field.label)}
        <div
          class="border-soft flex justify-between gap-3 border-b py-1.5 text-sm last:border-0 {field.isDifferent
            ? 'border-l-warn -mx-2 border-l-2 px-2'
            : ''}"
        >
          <dt class={field.isDifferent ? 'text-ink' : 'text-muted'}>
            {#if field.isDifferent}<span class="text-warn font-mono">&ne;</span>{/if}
            {field.label}
          </dt>
          <dd class="text-ink max-w-[60%] min-w-0 text-right font-medium [overflow-wrap:anywhere]">
            {field.primaryValue}
          </dd>
        </div>
      {/each}
    </dl>
    {#if primary.tags.length > 0}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each primary.tags as tag (tag)}
          <span class="border-border text-ink-light border px-1.5 py-0.5 font-mono text-xs">
            {tag}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Secondary -->
  <div class="panel">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-ink text-lg font-semibold">Compared Document</h4>
      <a
        href="{paperlessUrl}/documents/{secondary.paperlessId}/details"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent hover:text-accent-hover text-sm"
        title="Open in Paperless-NGX"
      >
        <ArrowSquareOutIcon class="h-4 w-4" />
      </a>
    </div>
    <dl class="space-y-2">
      {#each fields as field (field.label)}
        <div
          class="border-soft flex justify-between gap-3 border-b py-1.5 text-sm last:border-0 {field.isDifferent
            ? 'border-l-warn -mx-2 border-l-2 px-2'
            : ''}"
        >
          <dt class={field.isDifferent ? 'text-ink' : 'text-muted'}>
            {#if field.isDifferent}<span class="text-warn font-mono">&ne;</span>{/if}
            {field.label}
          </dt>
          <dd class="text-ink max-w-[60%] min-w-0 text-right font-medium [overflow-wrap:anywhere]">
            {field.secondaryValue}
          </dd>
        </div>
      {/each}
    </dl>
    {#if secondary.tags.length > 0}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each secondary.tags as tag (tag)}
          <span
            class="text-ink-light border px-1.5 py-0.5 font-mono text-xs {!primary.tags.includes(
              tag,
            )
              ? 'border-warn'
              : 'border-border'}"
          >
            {tag}
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>
