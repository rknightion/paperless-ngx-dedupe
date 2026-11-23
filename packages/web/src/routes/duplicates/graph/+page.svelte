<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Button, EChart, Select, TextField } from '$lib/components';
  import type { ECharts } from 'echarts';
  import type { GraphNode, GraphEdge } from '@paperless-dedupe/core';
  import { chartPalette, readToken } from '$lib/theme/tokens';
  import { formatGraphTooltip } from '$lib/duplicates/graph-tooltip';

  let { data } = $props();

  let selectedNode: GraphNode | null = $state(null);
  let selectedEdge: (GraphEdge & { sourceTitle: string; targetTitle: string }) | null =
    $state(null);

  // Correspondents cycle the design system's six-series chart ramp rather than
  // inventing a palette. More correspondents than series is expected here —
  // colour separates neighbours in the graph, it is not a legend key.
  const correspondentPalette = $derived(chartPalette());

  let correspondentColors = $derived(() => {
    const palette = correspondentPalette;
    const colors: Record<string, string> = {};
    const correspondents = [...new Set(data.graph.nodes.map((n) => n.correspondent ?? 'Unknown'))];
    correspondents.forEach((c, i) => {
      colors[c] = palette[i % palette.length];
    });
    return colors;
  });

  let nodeMap = $derived(new Map(data.graph.nodes.map((n) => [n.id, n])));

  // Edge status is carried by colour and line style together, so it never
  // rests on colour alone. Colours are resolved because ECharts paints to a
  // canvas and cannot take a var() reference. Dash patterns are 5 3 (dashed)
  // and 1.5 3 (dotted), repeated in the legend below.

  const edgeColors = $derived({
    deleted: readToken('--color-success'),
    ignored: readToken('--color-muted'),
    falsePositive: readToken('--color-muted'),
    pending: readToken('--color-chart-1'),
  });

  function edgeStyle(e: GraphEdge): { color: string; type: number[] | 'solid' } {
    if (e.status === 'deleted') return { color: edgeColors.deleted, type: 'solid' };
    if (e.status === 'ignored') return { color: edgeColors.ignored, type: [1.5, 3] };
    if (e.status === 'false_positive') {
      return { color: edgeColors.falsePositive, type: [5, 3] };
    }
    return { color: edgeColors.pending, type: 'solid' };
  }

  // Legend rows, in the same order as the status filter. Markup takes var()
  // references directly and follows the theme; keep in step with edgeStyle().
  const EDGE_LEGEND: { label: string; token: string; dash?: string }[] = [
    { label: 'Pending (solid line)', token: '--color-chart-1' },
    { label: 'Deleted (solid line, green)', token: '--color-success' },
    { label: 'False Positive (dashed line, grey)', token: '--color-muted', dash: '5 3' },
    { label: 'Ignored (dotted line, grey)', token: '--color-muted', dash: '1.5 3' },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartOption: any = $derived({
    tooltip: {
      trigger: 'item',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => formatGraphTooltip(params, nodeMap),
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        force: {
          repulsion: 200,
          edgeLength: [80, 250],
          gravity: 0.1,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 4 },
        },
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            const d = params.data as { meta: GraphNode };
            const title = d.meta.title;
            return title.length > 30 ? title.slice(0, 27) + '...' : title;
          },
        },
        data: data.graph.nodes.map((n) => ({
          name: n.id,
          symbolSize: Math.max(16, Math.min(40, 12 + n.groupCount * 8)),
          itemStyle: {
            color: correspondentColors()[n.correspondent ?? 'Unknown'] ?? edgeColors.falsePositive,
          },
          meta: n,
        })),
        edges: data.graph.edges.map((e) => ({
          source: e.source,
          target: e.target,
          lineStyle: {
            width: Math.max(1, e.confidenceScore * 5),
            ...edgeStyle(e),
            opacity: 0.7,
          },
          meta: e,
        })),
      },
    ],
  });

  function handleChartReady(chart: ECharts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.on('click', (params: any) => {
      if (params.dataType === 'node') {
        const d = params.data as { meta: GraphNode };
        selectedNode = d.meta;
        selectedEdge = null;
      } else if (params.dataType === 'edge') {
        const d = params.data as { meta: GraphEdge };
        selectedEdge = {
          ...d.meta,
          sourceTitle: nodeMap.get(d.meta.source)?.title ?? 'Unknown',
          targetTitle: nodeMap.get(d.meta.target)?.title ?? 'Unknown',
        };
        selectedNode = null;
      }
    });
  }

  // Filter helpers
  function applyFilters(updates: Record<string, string>) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function handleMinConfidence(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    applyFilters({ minConfidence: value ? String(Number(value) / 100) : '' });
  }

  function handleMaxGroups(value: string) {
    applyFilters({ maxGroups: value });
  }

  function handleStatusChange(value: string) {
    applyFilters({ status: value === 'all' ? '' : value });
  }

  let currentStatus = $derived(() => {
    return page.url.searchParams.get('status') ?? 'all';
  });
</script>

<svelte:head>
  <title>Similarity Graph - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-4">
  <!-- Page Header -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-ink text-2xl font-semibold tracking-tight">Similarity Graph</h1>
    </div>
    <Button variant="outline" href="/duplicates">Back to List</Button>
  </div>

  <!-- Info Bar -->
  <div class="text-muted text-sm">
    Showing {data.graph.groupsIncluded} of {data.graph.totalGroupsMatched} groups ({data.graph.nodes
      .length} documents, {data.graph.edges.length} connections)
  </div>

  <!-- Filter Bar -->
  <div class="panel">
    <div class="flex flex-wrap items-end gap-4">
      <TextField
        id="graph-min-confidence"
        label="Min Confidence"
        type="number"
        min={0}
        max={100}
        placeholder="0"
        value={page.url.searchParams.get('minConfidence')
          ? Math.round(Number(page.url.searchParams.get('minConfidence')) * 100)
          : ''}
        onchange={handleMinConfidence}
        class="w-28"
      />

      <Select
        id="graph-max-groups"
        label="Max Groups"
        value={page.url.searchParams.get('maxGroups') ?? '100'}
        onchange={handleMaxGroups}
        options={[
          { value: '25', label: '25' },
          { value: '50', label: '50' },
          { value: '100', label: '100' },
          { value: '200', label: '200' },
          { value: '500', label: '500' },
        ]}
      />

      <Select
        id="graph-status"
        label="Status"
        value={currentStatus()}
        onchange={handleStatusChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'false_positive', label: 'False Positive' },
          { value: 'ignored', label: 'Ignored' },
          { value: 'deleted', label: 'Deleted' },
        ]}
      />
    </div>
  </div>

  <!-- Graph + Detail Panel -->
  <div class="flex gap-4">
    <!-- Graph -->
    <div
      class="border-soft bg-canvas-deep relative min-w-0 flex-1 overflow-hidden rounded-xl border"
    >
      {#if data.graph.nodes.length > 0}
        <EChart option={chartOption} height="560px" onChartReady={handleChartReady} />
      {:else}
        <div class="flex h-96 items-center justify-center">
          <p class="text-muted">No data to display. Try adjusting filters or run analysis first.</p>
        </div>
      {/if}

      <!-- Legend (overlay inside graph) -->
      <div
        class="border-soft bg-surface/90 absolute bottom-4 left-4 rounded-lg border px-4 py-3 backdrop-blur-sm"
      >
        <h3 class="text-ink mb-2 text-sm font-semibold">Legend</h3>
        <div class="flex flex-wrap gap-6 text-xs">
          <div class="space-y-1">
            <p class="text-muted font-medium">Edge status (colour and line style)</p>
            {#each EDGE_LEGEND as row (row.label)}
              <div class="flex items-center gap-1.5">
                <svg width="24" height="4" viewBox="0 0 24 4" aria-hidden="true" class="shrink-0">
                  <line
                    x1="0"
                    y1="2"
                    x2="24"
                    y2="2"
                    style="stroke: var({row.token})"
                    stroke-width="2"
                    stroke-dasharray={row.dash}
                  />
                </svg>
                <span class="text-ink">{row.label}</span>
              </div>
            {/each}
          </div>
          <div class="space-y-1">
            <p class="text-muted font-medium">Node Size</p>
            <p class="text-ink">Larger = appears in more groups</p>
          </div>
          <div class="space-y-1">
            <p class="text-muted font-medium">Node Color</p>
            <p class="text-ink">Grouped by correspondent, colours repeat after six</p>
          </div>
          <div class="space-y-1">
            <p class="text-muted font-medium">Edge Width</p>
            <p class="text-ink">Thicker = higher confidence</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    {#if selectedNode || selectedEdge}
      <div class="panel w-80 shrink-0 space-y-4 transition-opacity duration-200">
        {#if selectedNode}
          <div>
            <h3 class="text-ink text-sm font-semibold">Document Details</h3>
            <dl class="mt-2 space-y-2 text-sm">
              <div>
                <dt class="text-muted">Title</dt>
                <dd class="text-ink">{selectedNode.title}</dd>
              </div>
              <div>
                <dt class="text-muted">Paperless ID</dt>
                <dd class="text-ink">{selectedNode.paperlessId}</dd>
              </div>
              <div>
                <dt class="text-muted">Correspondent</dt>
                <dd class="text-ink">{selectedNode.correspondent ?? 'N/A'}</dd>
              </div>
              <div>
                <dt class="text-muted">Document Type</dt>
                <dd class="text-ink">{selectedNode.documentType ?? 'N/A'}</dd>
              </div>
              <div>
                <dt class="text-muted">Appears in Groups</dt>
                <dd class="text-ink">{selectedNode.groupCount}</dd>
              </div>
            </dl>
          </div>
        {/if}

        {#if selectedEdge}
          <div>
            <h3 class="text-ink text-sm font-semibold">Connection Details</h3>
            <dl class="mt-2 space-y-2 text-sm">
              <div>
                <dt class="text-muted">Confidence</dt>
                <dd class="text-ink">
                  {(selectedEdge.confidenceScore * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt class="text-muted">Documents</dt>
                <dd class="text-ink">
                  {selectedEdge.sourceTitle} &harr; {selectedEdge.targetTitle}
                </dd>
              </div>
              <div>
                <dt class="text-muted">Status</dt>
                <dd class="text-ink capitalize">
                  {selectedEdge.status === 'false_positive'
                    ? 'False Positive'
                    : selectedEdge.status}
                </dd>
              </div>
            </dl>
            <Button size="sm" href="/duplicates/{selectedEdge.groupId}" class="mt-3">
              View Group
            </Button>
          </div>
        {/if}

        <Button
          variant="ghost"
          size="sm"
          onclick={() => {
            selectedNode = null;
            selectedEdge = null;
          }}
        >
          Close panel
        </Button>
      </div>
    {/if}
  </div>
</div>
