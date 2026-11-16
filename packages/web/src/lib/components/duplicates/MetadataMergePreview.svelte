<script lang="ts">
  import { type FrozenDuplicateGroup } from '@paperless-dedupe/core';
  let { merge }: { merge: NonNullable<FrozenDuplicateGroup['merge']> } = $props();
</script>

<section aria-label="Metadata to copy" class="mt-3 break-words">
  <h3 class="text-ink text-sm font-medium">Copy to kept document</h3>
  {#if merge.addTags.length || merge.setCorrespondent || merge.setDocumentType || merge.addCustomFieldNames.length}
    <ul class="text-muted mt-1 list-inside list-disc space-y-1 text-sm">
      {#if merge.addTags.length}<li>Tags: {merge.addTags.join(', ')}</li>{/if}
      {#if merge.setCorrespondent}<li>Correspondent: {merge.setCorrespondent}</li>{/if}
      {#if merge.setDocumentType}<li>Document type: {merge.setDocumentType}</li>{/if}
      {#if merge.addCustomFieldNames.length}<li>
          Custom fields: {merge.addCustomFieldNames.join(', ')}
        </li>{/if}
    </ul>
  {:else}
    <p class="text-muted mt-1 text-sm">No missing metadata to copy.</p>
  {/if}
</section>
