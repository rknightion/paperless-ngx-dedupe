<script lang="ts">
  import { goto } from '$app/navigation';
  import { ConfidenceBadge, EChart, ProgressBar } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';
  import type { EChartsOption } from 'echarts';

  let { data } = $props();

  // ── Shared state ──────────────────────────────────────────────────────
  let step = $state(1);
  let threshold = $state(95);
  let matchCount = $state<number | null>(null);
  let isLoadingCount = $state(false);

  // Step 2
  let groups = $state<
    Array<{
      id: string;
      primaryDocumentTitle: string | null;
      confidenceScore: number;
      memberCount: number;
    }>
  >([]);
  let groupsTotal = $state(0);
  let groupsOffset = $state(0);
  let excludedGroupIds = $state<Set<string>>(new Set());
  let isLoadingGroups = $state(false);

  // Step 3
  let selectedAction = $state<'review' | 'resolve' | 'delete'>('review');

  // Step 4
  let confirmChecks = $state({ understand: false, irreversible: false });

  // Step 5-6
  let isExecuting = $state(false);
  let executionProgress = $state(0);
  let executionMessage = $state('');
  let executionResult = $state<{ success: boolean; processed: number; errors: string[] } | null>(
    null,
  );

  // ── Derived values ────────────────────────────────────────────────────
  let selectedCount = $derived(groupsTotal - excludedGroupIds.size);

  let stepLabels = ['Filter', 'Review', 'Action', 'Confirm', 'Execute', 'Results'];

  let chartOption = $derived<EChartsOption>({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.stats.confidenceDistribution.map((b) => b.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: data.stats.confidenceDistribution.map((b) => ({
          value: b.count,
          itemStyle: {
            color: b.min * 100 >= threshold ? 'oklch(0.55 0.15 195)' : 'oklch(0.88 0.01 260)',
          },
        })),
        barWidth: '60%',
      },
    ],
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
  });

  let canProceedStep1 = $derived(matchCount !== null && matchCount > 0 && !isLoadingCount);
  let canProceedStep4 = $derived(
    confirmChecks.understand && (selectedAction !== 'delete' || confirmChecks.irreversible),
  );

  // ── Fetch helpers ─────────────────────────────────────────────────────
  async function fetchMatchCount() {
    isLoadingCount = true;
    try {
      const res = await fetch(
        `/api/v1/duplicates?minConfidence=${threshold / 100}&resolved=false&limit=1`,
      );
      const json = await res.json();
      matchCount = json.meta?.total ?? 0;
    } catch {
      matchCount = 0;
    }
    isLoadingCount = false;
  }

  async function fetchGroups() {
    isLoadingGroups = true;
    try {
      const res = await fetch(
        `/api/v1/duplicates?minConfidence=${threshold / 100}&resolved=false&limit=10&offset=${groupsOffset}`,
      );
      const json = await res.json();
      groups = json.data ?? [];
      groupsTotal = json.meta?.total ?? 0;
    } catch {
      groups = [];
      groupsTotal = 0;
    }
    isLoadingGroups = false;
  }

  // ── Effects ───────────────────────────────────────────────────────────
  $effect(() => {
    const _t = threshold;
    const timer = setTimeout(() => fetchMatchCount(), 300);
    return () => clearTimeout(timer);
  });

  // ── Step navigation ───────────────────────────────────────────────────
  function handleNext() {
    if (step === 1) {
      groupsOffset = 0;
      fetchGroups();
      step = 2;
    } else if (step === 2) {
      step = 3;
    } else if (step === 3) {
      confirmChecks = { understand: false, irreversible: false };
      step = 4;
    } else if (step === 4) {
      step = 5;
      execute();
    }
  }

  function handleBack() {
    if (step > 1 && step < 5) {
      step -= 1;
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────
  function prevPage() {
    groupsOffset = Math.max(0, groupsOffset - 10);
    fetchGroups();
  }

  function nextPage() {
    groupsOffset += 10;
    fetchGroups();
  }

  function toggleGroup(id: string) {
    const next = new Set(excludedGroupIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    excludedGroupIds = next;
  }

  // ── Execution ─────────────────────────────────────────────────────────
  async function execute() {
    isExecuting = true;
    executionProgress = 0;
    executionMessage = 'Gathering group IDs...';

    const allGroupIds: string[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      try {
        const res = await fetch(
          `/api/v1/duplicates?minConfidence=${threshold / 100}&resolved=false&limit=${limit}&offset=${offset}`,
        );
        const json = await res.json();
        const items = json.data ?? [];
        if (items.length === 0) break;
        for (const item of items) {
          if (!excludedGroupIds.has(item.id)) {
            allGroupIds.push(item.id);
          }
        }
        offset += limit;
        if (offset >= (json.meta?.total ?? 0)) break;
      } catch {
        executionResult = { success: false, processed: 0, errors: ['Failed to fetch group IDs'] };
        isExecuting = false;
        step = 6;
        return;
      }
    }

    executionMessage = `Processing ${allGroupIds.length} groups...`;
    executionProgress = 0.1;

    if (selectedAction === 'delete') {
      try {
        const res = await fetch('/api/v1/batch/delete-non-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: allGroupIds, confirm: true }),
        });
        if (res.ok) {
          const json = await res.json();
          const jobId = json.data?.jobId;
          if (jobId) {
            connectJobSSE(jobId, {
              onProgress: (d) => {
                executionProgress = d.progress;
                executionMessage = d.message ?? '';
              },
              onComplete: () => {
                executionResult = { success: true, processed: allGroupIds.length, errors: [] };
                isExecuting = false;
                step = 6;
              },
              onError: () => {
                executionResult = { success: false, processed: 0, errors: ['Job failed'] };
                isExecuting = false;
                step = 6;
              },
            });
            return;
          }
        } else {
          executionResult = { success: false, processed: 0, errors: ['Request failed'] };
          isExecuting = false;
          step = 6;
          return;
        }
      } catch {
        executionResult = { success: false, processed: 0, errors: ['Request failed'] };
        isExecuting = false;
        step = 6;
        return;
      }
    } else {
      const endpoint =
        selectedAction === 'review' ? '/api/v1/batch/review' : '/api/v1/batch/resolve';
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: allGroupIds }),
        });
        if (res.ok) {
          const json = await res.json();
          executionResult = {
            success: true,
            processed: json.data?.updated ?? allGroupIds.length,
            errors: [],
          };
        } else {
          executionResult = { success: false, processed: 0, errors: ['Request failed'] };
        }
      } catch {
        executionResult = { success: false, processed: 0, errors: ['Request failed'] };
      }
    }

    isExecuting = false;
    step = 6;
  }

  // ── Reset ─────────────────────────────────────────────────────────────
  function resetWizard() {
    step = 1;
    threshold = 95;
    matchCount = null;
    isLoadingCount = false;
    groups = [];
    groupsTotal = 0;
    groupsOffset = 0;
    excludedGroupIds = new Set();
    isLoadingGroups = false;
    selectedAction = 'review';
    confirmChecks = { understand: false, irreversible: false };
    isExecuting = false;
    executionProgress = 0;
    executionMessage = '';
    executionResult = null;
  }
</script>

<svelte:head>
  <title>Bulk Operations Wizard - Paperless Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Breadcrumb -->
  <nav class="text-muted text-sm">
    <a href="/duplicates" class="hover:text-accent">Duplicates</a>
    <span class="mx-1">/</span>
    <span class="text-ink">Bulk Operations Wizard</span>
  </nav>

  <!-- Step Indicator -->
  <div class="flex items-center gap-2">
    {#each stepLabels as label, i}
      {@const stepNum = i + 1}
      {@const isCompleted = step > stepNum}
      {@const isCurrent = step === stepNum}
      {#if i > 0}
        <div class="h-px flex-1 {isCompleted ? 'bg-success' : 'bg-soft'}"></div>
      {/if}
      <div class="flex items-center gap-2">
        <div
          class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold
            {isCurrent
            ? 'bg-accent text-white'
            : isCompleted
              ? 'bg-success text-white'
              : 'bg-soft text-muted'}"
        >
          {#if isCompleted}
            &#10003;
          {:else}
            {stepNum}
          {/if}
        </div>
        <span class="hidden text-sm font-medium sm:inline {isCurrent ? 'text-ink' : 'text-muted'}">
          {label}
        </span>
      </div>
    {/each}
  </div>

  <!-- Step Content -->
  <div class="panel">
    <!-- Step 1: Filter -->
    {#if step === 1}
      <h2 class="text-ink text-xl font-semibold">Set Confidence Threshold</h2>

      <div class="mt-6 space-y-6">
        <div>
          <div class="flex items-center justify-between">
            <label for="threshold-range" class="text-ink text-sm font-medium"
              >Minimum Confidence</label
            >
            <span class="text-accent text-lg font-semibold">{threshold}%</span>
          </div>
          <input
            id="threshold-range"
            type="range"
            min="50"
            max="100"
            step="1"
            bind:value={threshold}
            class="accent-accent mt-2 w-full"
          />
          <div class="text-muted mt-1 flex justify-between text-xs">
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <EChart option={chartOption} height="250px" />

        <div class="text-muted text-sm">
          {#if isLoadingCount}
            Loading matching groups...
          {:else if matchCount !== null}
            <span class="text-ink font-semibold">{matchCount}</span> unresolved groups match this threshold
          {/if}
        </div>
      </div>

      <div class="mt-8 flex justify-end">
        <button
          onclick={handleNext}
          disabled={!canProceedStep1}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <!-- Step 2: Review Groups -->
    {:else if step === 2}
      <h2 class="text-ink text-xl font-semibold">Review Matching Groups</h2>

      <div class="text-muted mt-4 text-sm">
        Selected: <span class="text-ink font-semibold">{selectedCount}</span> of {groupsTotal}
      </div>

      {#if isLoadingGroups}
        <div class="text-muted mt-6 text-sm">Loading groups...</div>
      {:else}
        <div class="mt-4 space-y-2">
          {#each groups as group}
            <div class="border-soft flex items-center gap-3 rounded-lg border px-4 py-3">
              <input
                type="checkbox"
                checked={!excludedGroupIds.has(group.id)}
                onchange={() => toggleGroup(group.id)}
                class="rounded"
              />
              <span class="text-ink flex-1 truncate text-sm">
                {group.primaryDocumentTitle ?? 'Untitled'}
              </span>
              <ConfidenceBadge score={group.confidenceScore} />
              <span class="text-muted text-xs">{group.memberCount} docs</span>
            </div>
          {/each}
        </div>

        {#if groupsTotal > 10}
          <div class="mt-4 flex items-center justify-between">
            <span class="text-muted text-sm">
              Showing {groupsOffset + 1}-{Math.min(groupsOffset + 10, groupsTotal)} of {groupsTotal}
            </span>
            <div class="flex gap-2">
              <button
                onclick={prevPage}
                disabled={groupsOffset === 0}
                class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onclick={nextPage}
                disabled={groupsOffset + 10 >= groupsTotal}
                class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        {/if}
      {/if}

      <div class="mt-8 flex justify-between">
        <button
          onclick={handleBack}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Back
        </button>
        <button
          onclick={handleNext}
          disabled={selectedCount === 0}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <!-- Step 3: Select Action -->
    {:else if step === 3}
      <h2 class="text-ink text-xl font-semibold">Choose Action</h2>

      <div class="mt-6 space-y-3">
        <button
          onclick={() => (selectedAction = 'review')}
          class="w-full rounded-lg border-2 px-4 py-4 text-left {selectedAction === 'review'
            ? 'border-accent bg-accent-light'
            : 'border-soft hover:border-accent'}"
        >
          <div class="flex items-center gap-3">
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'review'}
              class="accent-accent"
            />
            <div>
              <div class="text-ink font-medium">Mark All as Reviewed</div>
              <div class="text-muted text-sm">
                Mark matching groups as reviewed without making changes
              </div>
            </div>
          </div>
        </button>

        <button
          onclick={() => (selectedAction = 'resolve')}
          class="w-full rounded-lg border-2 px-4 py-4 text-left {selectedAction === 'resolve'
            ? 'border-accent bg-accent-light'
            : 'border-soft hover:border-accent'}"
        >
          <div class="flex items-center gap-3">
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'resolve'}
              class="accent-accent"
            />
            <div>
              <div class="text-ink font-medium">Resolve All</div>
              <div class="text-muted text-sm">Mark matching groups as fully resolved</div>
            </div>
          </div>
        </button>

        <button
          onclick={() => (selectedAction = 'delete')}
          class="w-full rounded-lg border-2 px-4 py-4 text-left {selectedAction === 'delete'
            ? 'border-ember bg-ember-light'
            : 'border-soft hover:border-ember'}"
        >
          <div class="flex items-center gap-3">
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'delete'}
              class="accent-ember"
            />
            <div>
              <div class="text-ink font-medium">Delete Non-Primary Documents</div>
              <div class="text-ember text-sm">
                Permanently delete non-primary documents from Paperless-NGX. This cannot be undone.
              </div>
            </div>
          </div>
        </button>
      </div>

      <div class="mt-8 flex justify-between">
        <button
          onclick={handleBack}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Back
        </button>
        <button
          onclick={handleNext}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Next
        </button>
      </div>

      <!-- Step 4: Confirm -->
    {:else if step === 4}
      <h2 class="text-ink text-xl font-semibold">Confirm Action</h2>

      <div class="mt-6 space-y-4">
        <div class="border-soft bg-canvas rounded-lg border px-4 py-3">
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted">Action</dt>
              <dd class="text-ink font-medium">
                {selectedAction === 'review'
                  ? 'Mark as Reviewed'
                  : selectedAction === 'resolve'
                    ? 'Resolve All'
                    : 'Delete Non-Primary Documents'}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Affected groups</dt>
              <dd class="text-ink font-medium">{selectedCount}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Confidence threshold</dt>
              <dd class="text-ink font-medium">{threshold}%+</dd>
            </div>
          </dl>
        </div>

        {#if selectedAction === 'delete'}
          <div class="border-ember bg-ember-light text-ember rounded-lg border-2 px-4 py-3 text-sm">
            Deleted documents cannot be recovered from Paperless-NGX.
          </div>
        {/if}

        <div class="space-y-3">
          <label class="flex items-start gap-3">
            <input type="checkbox" bind:checked={confirmChecks.understand} class="mt-0.5 rounded" />
            <span class="text-ink text-sm"
              >I understand this action affects {selectedCount} groups</span
            >
          </label>

          {#if selectedAction === 'delete'}
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                bind:checked={confirmChecks.irreversible}
                class="mt-0.5 rounded"
              />
              <span class="text-ink text-sm"
                >I understand deleted documents cannot be recovered</span
              >
            </label>
          {/if}
        </div>
      </div>

      <div class="mt-8 flex justify-between">
        <button
          onclick={handleBack}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Back
        </button>
        <button
          onclick={handleNext}
          disabled={!canProceedStep4}
          class="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50
            {selectedAction === 'delete'
            ? 'bg-ember hover:opacity-90'
            : 'bg-accent hover:bg-accent-hover'}"
        >
          Execute
        </button>
      </div>

      <!-- Step 5: Execute -->
    {:else if step === 5}
      <h2 class="text-ink text-xl font-semibold">Executing...</h2>

      <div class="mt-6">
        <ProgressBar progress={executionProgress} message={executionMessage} />
      </div>

      <!-- Step 6: Results -->
    {:else if step === 6}
      {#if executionResult?.success}
        <h2 class="text-success text-xl font-semibold">Operation Complete</h2>

        <div
          class="border-success bg-success-light text-success mt-6 rounded-lg border px-4 py-4 text-sm"
        >
          <span class="font-semibold">{executionResult.processed}</span> groups processed successfully.
        </div>
      {:else}
        <h2 class="text-ember text-xl font-semibold">Operation Failed</h2>

        <div
          class="border-ember bg-ember-light text-ember mt-6 rounded-lg border px-4 py-4 text-sm"
        >
          {#each executionResult?.errors ?? ['Unknown error'] as error}
            <p>{error}</p>
          {/each}
        </div>
      {/if}

      <div class="mt-8 flex gap-3">
        <button
          onclick={() => goto('/duplicates')}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Back to Duplicates
        </button>
        <button
          onclick={resetWizard}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Run Another Batch
        </button>
      </div>
    {/if}
  </div>
</div>
