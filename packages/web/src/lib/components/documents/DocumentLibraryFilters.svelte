<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    removeLibraryFilterHref,
    scalarSubmitInsightKeys,
    type DocumentLibraryLinkQuery,
  } from './document-library-links';

  type LibraryQuery = DocumentLibraryLinkQuery & {
    text?: string;
    missingOcr?: boolean;
    duplicate: 'any' | 'involved' | 'not-involved';
    limit: 25 | 50 | 100;
  };

  interface Props {
    query: LibraryQuery;
  }

  let { query }: Props = $props();
  let submitting = $state(false);
  let customFieldValue = $derived(
    query.customFieldValue === undefined ? '' : JSON.stringify(query.customFieldValue),
  );
  const EXPORT_FILTER_KEYS = [
    'text',
    'missingOcr',
    'correspondent',
    'documentType',
    'tag',
    'customFieldId',
    'customFieldValue',
    'duplicate',
    'aiStatus',
    'freshness',
    'missingCorrespondent',
    'missingDocumentType',
    'missingTags',
    'correspondentSet',
    'documentTypeSet',
    'tagSet',
  ];
  const INSIGHT_FILTER_LABELS = {
    missingCorrespondent: (value: boolean) =>
      value ? 'Missing correspondent' : 'Has correspondent',
    missingDocumentType: (value: boolean) =>
      value ? 'Missing document type' : 'Has document type',
    missingTags: (value: boolean) => (value ? 'Missing tags' : 'Has tags'),
    correspondentSet: (value: string[]) => `Correspondent: ${value.join(' or ')}`,
    documentTypeSet: (value: string[]) => `Document type: ${value.join(' or ')}`,
    tagSet: (value: string[]) => `Tag: ${value.join(' or ')}`,
  };

  let activeInsightFilters = $derived.by(() => {
    const entries: { key: keyof typeof INSIGHT_FILTER_LABELS; label: string; href: string }[] = [];
    for (const key of Object.keys(
      INSIGHT_FILTER_LABELS,
    ) as (keyof typeof INSIGHT_FILTER_LABELS)[]) {
      const value = query[key];
      if (value === undefined) continue;
      const label = (INSIGHT_FILTER_LABELS[key] as (entry: never) => string)(value as never);
      entries.push({ key, label, href: removeLibraryFilterHref(query, key) });
    }
    return entries;
  });

  let exportHref = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    for (const key of EXPORT_FILTER_KEYS) {
      const value = $page.url.searchParams.get(key);
      if (value !== null) params.set(key, value);
    }
    const suffix = params.toString();
    return `/api/v1/export/documents.csv${suffix ? `?${suffix}` : ''}`;
  });

  afterNavigate(() => {
    submitting = false;
  });

  function applyFilters(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const valueInput = form.elements.namedItem('customFieldValue') as HTMLInputElement;
    const value = valueInput.value.trim();

    valueInput.setCustomValidity('');
    if (value) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (JSON.stringify(parsed) !== value) {
          valueInput.setCustomValidity(
            'Use canonical JSON, for example "text", 42, true or [1,2].',
          );
        }
      } catch {
        valueInput.setCustomValidity('Use valid JSON, for example "text", 42, true or [1,2].');
      }
      if (!valueInput.reportValidity()) return;
    }

    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    params.set('library', 'true');
    const insightKeysToPreserve = scalarSubmitInsightKeys({
      correspondent: String(formData.get('correspondent') ?? ''),
      documentType: String(formData.get('documentType') ?? ''),
      tag: String(formData.get('tag') ?? ''),
    });
    for (const key of insightKeysToPreserve) {
      const current = $page.url.searchParams.get(key);
      if (current !== null) params.set(key, current);
    }
    for (const [key, entry] of formData.entries()) {
      const normalized = String(entry).trim();
      if (!normalized || (key === 'duplicate' && normalized === 'any')) continue;
      params.set(key, normalized);
    }
    submitting = true;
    void goto(`${$page.url.pathname}?${params.toString()}`);
  }
</script>

<section class="panel space-y-4" aria-labelledby="document-library-filters">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 id="document-library-filters" class="text-ink text-base font-semibold">
        Search the library
      </h2>
      <p class="text-muted mt-1 text-sm">
        Search synced metadata and OCR without displaying document content.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <a
        href={exportHref}
        download
        class="border-soft text-ink rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Export filtered CSV
      </a>
      <a
        href="/documents?library=true"
        class="border-soft text-ink rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Clear filters
      </a>
    </div>
  </div>

  {#if activeInsightFilters.length > 0}
    <div class="space-y-2" aria-labelledby="active-insight-filters">
      <h3 id="active-insight-filters" class="text-ink text-sm font-medium">
        Active quality filters
      </h3>
      <ul class="flex flex-wrap gap-2">
        {#each activeInsightFilters as filter (filter.key)}
          <li>
            <a
              href={filter.href}
              aria-label="Remove {filter.label} filter"
              class="bg-accent-light text-accent inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span class="truncate">{filter.label}</span>
              <span aria-hidden="true">×</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <form class="space-y-4" onsubmit={applyFilters}>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label class="text-ink text-sm font-medium lg:col-span-2">
        Search title or OCR
        <input
          name="text"
          value={query.text ?? ''}
          maxlength="200"
          placeholder="Invoice number, title or OCR phrase"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>

      <label class="text-ink text-sm font-medium">
        OCR content
        <select
          name="missingOcr"
          value={query.missingOcr === true ? 'true' : query.missingOcr === false ? 'false' : ''}
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Any coverage</option>
          <option value="false">Present</option>
          <option value="true">Missing</option>
        </select>
      </label>

      <label class="text-ink text-sm font-medium">
        Correspondent
        <input
          name="correspondent"
          value={query.correspondent ?? ''}
          maxlength="200"
          placeholder="Exact correspondent"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>

      <label class="text-ink text-sm font-medium">
        Document type
        <input
          name="documentType"
          value={query.documentType ?? ''}
          maxlength="200"
          placeholder="Exact document type"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>

      <label class="text-ink text-sm font-medium">
        Tag
        <input
          name="tag"
          value={query.tag ?? ''}
          maxlength="200"
          placeholder="Exact tag"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>

      <label class="text-ink text-sm font-medium">
        Duplicate involvement
        <select
          name="duplicate"
          value={query.duplicate}
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="any">Any</option>
          <option value="involved">In a duplicate group</option>
          <option value="not-involved">Not in a duplicate group</option>
        </select>
      </label>

      <label class="text-ink text-sm font-medium">
        AI review status
        <select
          name="aiStatus"
          value={query.aiStatus ?? ''}
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Any status</option>
          <option value="unprocessed">Unprocessed</option>
          <option value="pending_review">Pending review</option>
          <option value="applied">Applied</option>
          <option value="partial">Partially applied</option>
          <option value="reverted">Reverted</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
      </label>

      <label class="text-ink text-sm font-medium">
        AI freshness
        <select
          name="freshness"
          value={query.freshness ?? ''}
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Any freshness</option>
          <option value="fresh">Fresh</option>
          <option value="stale">Stale</option>
        </select>
      </label>

      <label class="text-ink text-sm font-medium">
        Custom field ID
        <input
          name="customFieldId"
          type="number"
          min="1"
          step="1"
          value={query.customFieldId ?? ''}
          placeholder="Field ID"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>

      <label class="text-ink text-sm font-medium sm:col-span-2">
        Custom field value
        <input
          name="customFieldValue"
          value={customFieldValue}
          maxlength="2000"
          placeholder="&quot;text&quot;, 42, true, null or [1,2]"
          aria-label="Custom field value"
          aria-describedby="custom-field-value-help"
          class="border-soft bg-surface mt-1 w-full rounded-lg border px-3 py-2 font-mono"
        />
        <span id="custom-field-value-help" class="text-muted mt-1 block text-xs">
          Canonical JSON. A value requires a custom field ID.
        </span>
      </label>
    </div>

    <div class="flex justify-end">
      {#if submitting}
        <span
          role="status"
          aria-label="Loading document library"
          class="text-muted mr-3 self-center text-sm"
        >
          Loading document library…
        </span>
      {/if}
      <button
        type="submit"
        disabled={submitting}
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Apply library filters
      </button>
    </div>
  </form>
</section>
