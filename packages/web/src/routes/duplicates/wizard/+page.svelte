<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { createDeletionPreview } from '$lib/duplicate-deletion-preview';
  import ConfidenceLegend from '$lib/components/ui/ConfidenceLegend.svelte';
  import KeeperSelection from '$lib/components/duplicates/KeeperSelection.svelte';
  import {
    deletionRunFromCompletion,
    type UndoDeletionRun,
  } from '$lib/components/duplicates/UndoDeletion.svelte';
  let deletionRun = $state<UndoDeletionRun | null>(null);
  import { goto } from '$app/navigation';
  import type { DuplicateGroupMember } from '@paperless-dedupe/core';
  import {
    Button,
    Checkbox,
    ConfidenceBadge,
    EChart,
    GroupPreviewModal,
    ProgressBar,
    RichTooltip,
    ConfidenceTooltipContent,
    RecycleBinPrompt,
    Select,
    ThumbnailPreview,
    WizardGroupCard,
  } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';
  import { readToken } from '$lib/theme/tokens';
  import {
    trackWizardStepChanged,
    trackWizardThresholdSet,
    trackWizardExecuted,
    startTimer,
  } from '$lib/faro-events';
  import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
  import GridFourIcon from 'phosphor-svelte/lib/GridFourIcon';
  import ListIcon from 'phosphor-svelte/lib/ListIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
  import type { EChartsOption } from 'echarts';

  let { data } = $props();
  const readOnly = $derived(data.readOnly === true);

  // ── Shared state ──────────────────────────────────────────────────────
  let step = $state(1);
  let keeperBusy = $state(false);
  let threshold = $state(95);
  let matchCount = $state<number | null>(null);
  let totalMemberCountAll = $state<number | null>(null);
  let isLoadingCount = $state(false);

  // Step 2
  let sortBy = $state<'confidence' | 'created_at' | 'member_count'>('confidence');
  let sortOrder = $state<'asc' | 'desc'>('desc');
  let groups = $state<
    Array<{
      id: string;
      primaryDocumentTitle: string | null;
      primaryPaperlessId: number | null;
      primaryThumbnailUrl?: string | null;
      confidenceScore: number;
      memberCount: number;
      jaccardSimilarity: number | null;
      fuzzyTextRatio: number | null;
      discriminativeScore: number | null;
    }>
  >([]);
  let groupsTotal = $state(0);
  let groupsOffset = $state(0);
  let excludedGroupIds = $state<Set<string>>(new Set());
  let isLoadingGroups = $state(false);
  let viewMode = $state<'condensed' | 'expanded'>('condensed');

  // Expanded view member cache
  const memberCache = new SvelteMap<string, DuplicateGroupMember[]>();
  let memberCacheGeneration = 0;

  // Preview modal
  let previewGroupId: string | null = $state(null);
  let previewGroupTitle = $state('');
  let previewConfidenceScore = $state(0);

  // Step 3
  let selectedAction = $state<'false_positive' | 'ignored' | 'delete'>('false_positive');

  // Step 4
  let confirmChecks = $state({ understand: false, irreversible: false });

  // Step 5-6
  let executionProgress = $state(0);
  let executionMessage = $state('');
  let executionResult = $state<{ success: boolean; processed: number; errors: string[] } | null>(
    null,
  );
  let showRecycleBinSection = $state(false);

  // ── Derived values ────────────────────────────────────────────────────
  let selectedCount = $derived(groupsTotal - excludedGroupIds.size);

  let stepLabels = ['Filter', 'Review', 'Action', 'Confirm', 'Execute', 'Results'];

  // Resolved rather than var() references — these are painted to a canvas.
  const bucketColors = $derived({
    included: readToken('--color-chart-1'),
    excluded: readToken('--color-soft'),
  });

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
        // Buckets the threshold includes take the first chart series; the rest
        // drop back to the hairline grey. Series 1 rather than the accent —
        // this is data, not an action.
        data: data.stats.confidenceDistribution.map((b) => ({
          value: b.count,
          itemStyle: {
            color: b.min * 100 >= threshold ? bucketColors.included : bucketColors.excluded,
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
        `/api/v1/duplicates?minConfidence=${threshold / 100}&status=pending&limit=1`,
      );
      const json = await res.json();
      matchCount = json.meta?.total ?? 0;
      totalMemberCountAll = json.meta?.totalMemberCount ?? null;
    } catch {
      matchCount = 0;
      totalMemberCountAll = null;
    }
    isLoadingCount = false;
  }

  async function fetchGroups() {
    isLoadingGroups = true;
    try {
      const res = await fetch(
        `/api/v1/duplicates?minConfidence=${threshold / 100}&status=pending&limit=10&offset=${groupsOffset}&sortBy=${sortBy}&sortOrder=${sortOrder}&includeMedia=true`,
      );
      const json = await res.json();
      groups = json.data ?? [];
      groupsTotal = json.meta?.total ?? 0;
    } catch {
      groups = [];
      groupsTotal = 0;
    }
    isLoadingGroups = false;
    if (viewMode === 'expanded') {
      fetchMembersForExpandedView();
    }
  }

  async function fetchMembersForExpandedView() {
    const generation = memberCacheGeneration;
    const uncached = groups.filter((g) => !memberCache.has(g.id));
    if (uncached.length === 0) return;
    const results = await Promise.all(
      uncached.map(async (g) => {
        try {
          const res = await fetch(`/api/v1/duplicates/${g.id}?light=true`);
          const json = await res.json();
          return { id: g.id, members: json.data.members as DuplicateGroupMember[] };
        } catch {
          return { id: g.id, members: [] as DuplicateGroupMember[] };
        }
      }),
    );
    if (generation !== memberCacheGeneration) return;
    for (const r of results) memberCache.set(r.id, r.members);
  }

  function invalidateMemberCache() {
    memberCacheGeneration++;
    memberCache.clear();
  }

  // ── Effects ───────────────────────────────────────────────────────────
  $effect(() => {
    const _t = threshold;
    const timer = setTimeout(() => fetchMatchCount(), 300);
    return () => clearTimeout(timer);
  });

  // ── Preview modal ────────────────────────────────────────────────────
  function openPreview(group: (typeof groups)[0]) {
    previewGroupId = group.id;
    previewGroupTitle = group.primaryDocumentTitle ?? 'Untitled';
    previewConfidenceScore = group.confidenceScore;
  }

  // ── Step navigation ───────────────────────────────────────────────────
  function handleNext() {
    if (step === 1) {
      trackWizardThresholdSet(threshold, matchCount ?? 0);
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
    trackWizardStepChanged(step);
  }

  function handleBack() {
    if (step > 1 && step < 5) {
      step -= 1;
    }
  }

  // ── Sort ──────────────────────────────────────────────────────────────
  function handleSortChange(value: string) {
    sortBy = value as typeof sortBy;
    groupsOffset = 0;
    fetchGroups();
  }

  function toggleSortOrder() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    groupsOffset = 0;
    fetchGroups();
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
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
    if (readOnly && selectedAction === 'delete') return;
    executionProgress = 0;
    executionMessage = 'Gathering group IDs...';
    const stopWizardTimer = startTimer('wizard_execution_duration');

    const allGroupIds: string[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      try {
        const res = await fetch(
          `/api/v1/duplicates?minConfidence=${threshold / 100}&status=pending&limit=${limit}&offset=${offset}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
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
        step = 6;
        return;
      }
    }

    executionMessage = `Processing ${allGroupIds.length} groups...`;
    executionProgress = 0.1;

    if (selectedAction === 'delete') {
      try {
        const preview = await createDeletionPreview(allGroupIds);
        const res = await fetch('/api/v1/batch/delete-non-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planToken: preview.planToken, confirm: true }),
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
              onComplete: (event) => {
                deletionRun = deletionRunFromCompletion(event);
                executionResult = { success: true, processed: allGroupIds.length, errors: [] };
                showRecycleBinSection = true;
                stopWizardTimer();
                trackWizardExecuted({
                  action: selectedAction,
                  groupCount: allGroupIds.length,
                  success: true,
                });
                step = 6;
              },
              onError: () => {
                executionResult = { success: false, processed: 0, errors: ['Job failed'] };
                stopWizardTimer();
                trackWizardExecuted({
                  action: selectedAction,
                  groupCount: allGroupIds.length,
                  success: false,
                  errors: 1,
                });
                step = 6;
              },
            });
            return;
          }
        } else {
          executionResult = { success: false, processed: 0, errors: ['Request failed'] };
          step = 6;
          return;
        }
      } catch {
        executionResult = { success: false, processed: 0, errors: ['Request failed'] };
        step = 6;
        return;
      }
    } else {
      let processed = 0;
      try {
        for (let start = 0; start < allGroupIds.length; start += 10_000) {
          const groupIds = allGroupIds.slice(start, start + 10_000);
          const res = await fetch('/api/v1/batch/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupIds, status: selectedAction }),
          });
          if (!res.ok) throw new Error('Request failed');
          const json = await res.json();
          processed += json.data?.updated ?? groupIds.length;
          executionProgress = (start + groupIds.length) / allGroupIds.length;
          executionMessage = `${processed} groups processed...`;
        }
        executionResult = { success: true, processed, errors: [] };
      } catch {
        executionResult = {
          success: false,
          processed,
          errors: [
            `${processed} groups processed before the request failed. No further groups were submitted.`,
          ],
        };
      }
    }

    stopWizardTimer();
    trackWizardExecuted({
      action: selectedAction,
      groupCount: allGroupIds.length,
      success: executionResult?.success ?? false,
      errors: executionResult?.errors?.length ?? 0,
    });
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
    sortBy = 'confidence';
    sortOrder = 'desc';
    excludedGroupIds = new Set();
    isLoadingGroups = false;
    viewMode = 'condensed';
    invalidateMemberCache();
    previewGroupId = null;
    selectedAction = 'false_positive';
    confirmChecks = { understand: false, irreversible: false };
    executionProgress = 0;
    executionMessage = '';
    executionResult = null;
    showRecycleBinSection = false;
  }
</script>

<svelte:head>
  <title>Bulk Operations Wizard - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Breadcrumb -->
  <div class="space-y-2">
    <nav aria-label="Breadcrumb" class="text-sm">
      <a href="/duplicates" class="text-accent hover:text-accent-hover underline">Duplicates</a>
    </nav>
    <h1 class="text-ink text-xl font-semibold">Bulk Operations Wizard</h1>
  </div>

  <!-- Step Indicator -->
  <div class="flex items-center gap-2">
    {#each stepLabels as label, i (i)}
      {@const stepNum = i + 1}
      {@const isCompleted = step > stepNum}
      {@const isCurrent = step === stepNum}
      {#if i > 0}
        <div class="h-px flex-1 {isCompleted ? 'bg-success' : 'bg-border'}"></div>
      {/if}
      <div class="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
        <div
          class="flex h-6 w-6 items-center justify-center rounded-sm font-mono text-xs font-semibold tabular-nums
            {isCurrent
            ? 'bg-accent text-on-accent'
            : isCompleted
              ? 'bg-success text-on-accent'
              : 'border-border text-muted border'}"
        >
          {#if isCompleted}
            &#10003;
          {:else}
            {stepNum}
          {/if}
        </div>
        <span
          class="hidden text-sm sm:inline {isCurrent
            ? 'text-ink font-semibold'
            : isCompleted
              ? 'text-ink-light font-medium'
              : 'text-muted'}"
        >
          {label}
        </span>
      </div>
    {/each}
  </div>

  <!-- Step Content -->
  <div class="panel">
    <!-- Step 1: Filter -->
    {#if step === 1}
      <h2 class="text-ink text-lg font-semibold">Set Confidence Threshold</h2>

      <div class="mt-6 space-y-6">
        <div>
          <div class="flex items-center justify-between">
            <label for="threshold-range" class="text-ink text-sm font-medium">
              Minimum Confidence
            </label>
            <span class="text-ink font-mono text-lg font-semibold tabular-nums">{threshold}%</span>
          </div>
          <!-- Native: a range slider, which none of the form primitives cover. -->
          <input
            disabled={keeperBusy}
            id="threshold-range"
            type="range"
            min="50"
            max="100"
            step="1"
            bind:value={threshold}
            class="accent-accent mt-2 w-full"
          />
          <div class="text-muted mt-1 flex justify-between font-mono text-xs">
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <KeeperSelection
          bind:busy={keeperBusy}
          minConfidence={threshold / 100}
          onApplied={() => {
            invalidateMemberCache();
            groups = [];
            void fetchMatchCount();
          }}
        />

        <EChart option={chartOption} height="250px" />

        <div class="text-muted text-sm">
          {#if isLoadingCount}
            Loading matching groups...
          {:else if matchCount !== null}
            <span class="text-ink font-mono font-semibold tabular-nums">{matchCount}</span>
            <span>pending groups match this threshold</span>
          {/if}
        </div>
      </div>

      <div class="mt-8 flex justify-end">
        <Button onclick={handleNext} disabled={!canProceedStep1 || keeperBusy}>Next</Button>
      </div>

      <!-- Step 2: Review Groups -->
    {:else if step === 2}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-ink text-lg font-semibold">Review Matching Groups</h2>
        <div class="flex items-center gap-2">
          <!-- Sort controls -->
          <Select
            onchange={handleSortChange}
            value={sortBy}
            options={[
              { value: 'confidence', label: 'Confidence' },
              { value: 'created_at', label: 'Created' },
              { value: 'member_count', label: 'Members' },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            icon={sortOrder === 'desc' ? ArrowDownIcon : ArrowUpIcon}
            onclick={toggleSortOrder}
            title="Toggle sort order"
          />
          <!-- View mode toggle. The two buttons are segments of one bordered control with a
               hairline divider and a selected fill, which no Button variant expresses, so they
               stay native. -->
          <div class="border-border flex h-[26px] items-stretch border">
            <button
              onclick={() => (viewMode = 'condensed')}
              class="border-border inline-flex items-center border-r px-2 {viewMode === 'condensed'
                ? 'bg-selected text-ink'
                : 'text-muted hover:bg-canvas-deep'}"
              title="Condensed view"
            >
              <ListIcon class="h-3.5 w-3.5" />
            </button>
            <button
              onclick={() => {
                viewMode = 'expanded';
                fetchMembersForExpandedView();
              }}
              class="inline-flex items-center px-2 {viewMode === 'expanded'
                ? 'bg-selected text-ink'
                : 'text-muted hover:bg-canvas-deep'}"
              title="Expanded view"
            >
              <GridFourIcon class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div class="text-muted text-sm">
          Selected: <span class="text-ink font-mono font-semibold tabular-nums">
            {selectedCount}
          </span>
          of <span class="font-mono tabular-nums">{groupsTotal}</span>
        </div>
        <ConfidenceLegend />
      </div>

      {#if isLoadingGroups}
        <div class="text-muted mt-6 text-sm">Loading groups...</div>
      {:else if viewMode === 'condensed'}
        <!-- Condensed view -->
        <div class="mt-4 space-y-2">
          {#each groups as group (group.id)}
            <div class="border-soft bg-surface flex items-center gap-3 border px-3 py-2 sm:px-4">
              <Checkbox
                checked={!excludedGroupIds.has(group.id)}
                onchange={() => toggleGroup(group.id)}
              />
              <ThumbnailPreview
                src={group.primaryThumbnailUrl}
                alt={group.primaryDocumentTitle ?? 'Untitled'}
              />
              <span class="text-ink flex-1 truncate text-sm">
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
              <!-- Native: a bare icon-only control, with no border, fill or padding, inside a row.
                   Button has no icon-only variant to express it. -->
              <button
                onclick={() => openPreview(group)}
                class="text-muted hover:text-accent shrink-0"
                title="Quick preview"
              >
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
              <span class="text-muted font-mono text-xs tabular-nums">
                <span class="hidden sm:inline">{group.memberCount} </span>docs
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Expanded view -->
        <div class="mt-4 space-y-4">
          {#each groups as group (group.id)}
            <WizardGroupCard
              {group}
              excluded={excludedGroupIds.has(group.id)}
              paperlessUrl={data.paperlessUrl}
              members={memberCache.get(group.id) ?? null}
              ontoggle={() => toggleGroup(group.id)}
              onpreview={() => openPreview(group)}
            />
          {/each}
        </div>
      {/if}

      {#if groupsTotal > 10}
        <div class="mt-4 flex items-center justify-between">
          <span class="text-muted font-mono text-xs tabular-nums">
            Showing {groupsOffset + 1}-{Math.min(groupsOffset + 10, groupsTotal)} of {groupsTotal}
          </span>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" onclick={prevPage} disabled={groupsOffset === 0}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={nextPage}
              disabled={groupsOffset + 10 >= groupsTotal}
            >
              Next
            </Button>
          </div>
        </div>
      {/if}

      <div class="mt-8 flex justify-between">
        <Button variant="outline" onclick={handleBack}>Back</Button>
        <Button onclick={handleNext} disabled={selectedCount === 0}>Next</Button>
      </div>

      <!-- Step 3: Select Action -->
    {:else if step === 3}
      <h2 class="text-ink text-lg font-semibold">Choose Action</h2>

      <!-- The three action cards stay native buttons: each is a whole-card selector that wraps a
           radio and a description, markup Button cannot express. The radios are display only. -->
      <div class="mt-6 space-y-3">
        <button
          onclick={() => (selectedAction = 'false_positive')}
          class="w-full border px-4 py-3 text-left {selectedAction === 'false_positive'
            ? 'border-accent bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
            : 'border-soft hover:border-border-hover hover:bg-canvas-deep'}"
        >
          <div class="flex items-center gap-3">
            <XCircleIcon class="text-muted h-5 w-5 shrink-0" />
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'false_positive'}
              class="accent-accent"
            />
            <div>
              <div class="text-ink font-medium">Dismiss All</div>
              <div class="text-muted text-sm">
                Mark matching groups as false positives (not actually duplicates)
              </div>
            </div>
          </div>
        </button>

        <button
          onclick={() => (selectedAction = 'ignored')}
          class="w-full border px-4 py-3 text-left {selectedAction === 'ignored'
            ? 'border-accent bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
            : 'border-soft hover:border-border-hover hover:bg-canvas-deep'}"
        >
          <div class="flex items-center gap-3">
            <EyeIcon class="text-muted h-5 w-5 shrink-0" />
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'ignored'}
              class="accent-accent"
            />
            <div>
              <div class="text-ink font-medium">Ignore All</div>
              <div class="text-muted text-sm">
                Real duplicates, but keep all copies without making changes
              </div>
            </div>
          </div>
        </button>

        <button
          onclick={() => (selectedAction = 'delete')}
          disabled={readOnly}
          title={readOnly ? 'Paperless is read-only' : undefined}
          class="disabled:border-border disabled:text-disabled w-full border px-4 py-3 text-left disabled:cursor-not-allowed {selectedAction ===
          'delete'
            ? 'border-ember bg-ember-light'
            : 'border-soft hover:border-ember hover:bg-canvas-deep'}"
        >
          <div class="flex items-center gap-3">
            <TrashIcon class="text-ember h-5 w-5 shrink-0" />
            <input
              type="radio"
              name="action"
              checked={selectedAction === 'delete'}
              disabled={readOnly}
              class="accent-ember"
            />
            <div>
              <div class="text-ink font-medium">Delete Non-Primary Documents</div>
              <div class="text-ember text-sm">
                Delete non-primary documents from Paperless-NGX. Documents are moved to the recycle
                bin.
              </div>
            </div>
          </div>
        </button>
      </div>

      <div class="mt-8 flex justify-between">
        <Button variant="outline" onclick={handleBack}>Back</Button>
        <Button onclick={handleNext}>Next</Button>
      </div>

      <!-- Step 4: Confirm -->
    {:else if step === 4}
      <h2 class="text-ink text-lg font-semibold">Confirm Action</h2>

      <div class="mt-6 space-y-4">
        <div class="border-soft bg-canvas border px-4 py-3">
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted">Action</dt>
              <dd class="text-ink font-medium">
                {selectedAction === 'false_positive'
                  ? 'Dismiss as False Positives'
                  : selectedAction === 'ignored'
                    ? 'Ignore All (Keep Copies)'
                    : 'Delete Non-Primary Documents'}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Affected groups</dt>
              <dd class="text-ink font-mono font-medium tabular-nums">{selectedCount}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Estimated documents</dt>
              <dd class="text-ink font-medium">
                {#if totalMemberCountAll !== null}
                  {selectedAction === 'delete'
                    ? `~${totalMemberCountAll - selectedCount} non-primary`
                    : totalMemberCountAll}
                {:else}
                  —
                {/if}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Confidence threshold</dt>
              <dd class="text-ink font-mono font-medium tabular-nums">{threshold}%+</dd>
            </div>
          </dl>
        </div>

        {#if selectedAction === 'delete'}
          <div class="border-ember bg-ember-light text-ember border px-4 py-3 text-sm">
            Non-primary documents from each group will be moved to the Paperless-NGX recycle bin.
            You can restore them or empty the recycle bin after the operation completes.
          </div>
        {/if}

        <div class="space-y-3">
          <Checkbox
            bind:checked={confirmChecks.understand}
            label="I understand this action affects {selectedCount} groups"
          />

          {#if selectedAction === 'delete'}
            <Checkbox
              bind:checked={confirmChecks.irreversible}
              label="I understand deleted documents will be moved to the Paperless-NGX recycle bin"
            />
          {/if}
        </div>
      </div>

      <div class="mt-8 flex justify-between">
        <Button variant="outline" onclick={handleBack}>Back</Button>
        <Button
          variant={selectedAction === 'delete' ? 'destructive' : 'primary'}
          onclick={handleNext}
          disabled={!canProceedStep4 || (readOnly && selectedAction === 'delete')}
          title={readOnly && selectedAction === 'delete' ? 'Paperless is read-only' : undefined}
        >
          Execute
        </Button>
      </div>

      <!-- Step 5: Execute -->
    {:else if step === 5}
      <h2 class="text-ink text-lg font-semibold">Executing...</h2>

      <div class="mt-6">
        <ProgressBar progress={executionProgress} message={executionMessage} />
      </div>

      <!-- Step 6: Results -->
    {:else if step === 6}
      {#if executionResult?.success}
        <div class="flex flex-col items-center text-center">
          <CheckCircleIcon class="text-success h-6 w-6" />
          <h2 class="text-success mt-2 text-lg font-semibold">Operation Complete</h2>
          <div class="border-success bg-success-light text-success mt-4 border px-4 py-3 text-sm">
            <span class="font-mono font-semibold tabular-nums">{executionResult.processed}</span>
            <span>groups processed successfully.</span>
          </div>
        </div>

        {#if showRecycleBinSection && selectedAction === 'delete'}
          <RecycleBinPrompt {deletionRun} />
        {/if}
      {:else}
        <div class="flex flex-col items-center text-center">
          <XCircleIcon class="text-ember h-6 w-6" />
          <h2 class="text-ember mt-2 text-lg font-semibold">Operation Failed</h2>
          <div class="border-ember bg-ember-light text-ember mt-4 border px-4 py-3 text-sm">
            {#each executionResult?.errors ?? ['Unknown error'] as error, i (i)}
              <p>{error}</p>
            {/each}
          </div>
        </div>
      {/if}

      <div class="mt-8 flex gap-3">
        <Button variant="outline" onclick={() => goto('/duplicates')}>Back to Duplicates</Button>
        <Button onclick={resetWizard}>Run Another Batch</Button>
      </div>
    {/if}
  </div>
</div>

<!-- Group Preview Modal -->
{#if previewGroupId}
  <GroupPreviewModal
    open={previewGroupId !== null}
    groupId={previewGroupId}
    groupTitle={previewGroupTitle}
    confidenceScore={previewConfidenceScore}
    paperlessUrl={data.paperlessUrl}
    onclose={() => {
      previewGroupId = null;
    }}
  />
{/if}
