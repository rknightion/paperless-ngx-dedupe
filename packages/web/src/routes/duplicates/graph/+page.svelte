<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { EChart } from '$lib/components';
  import type { ECharts } from 'echarts';
  import type { GraphNode, GraphEdge } from '@paperless-dedupe/core';

  let { data } = $props();

  let selectedNode: GraphNode | null = $state(null);
  let selectedEdge: (GraphEdge & { sourceTitle: string; targetTitle: string }) | null =
    $state(null);

  // Assign colors to correspondents
  const PALETTE = [
    '#6366f1', // indigo
    '#f59e0b', // amber
    '#10b981', // emerald
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
    '#14b8a6', // teal
    '#84cc16', // lime
  ];

  let correspondentColors = $derived(() => {
    const colors: Record<string, string> = {};
    const correspondents = [...new Set(data.graph.nodes.map((n) => n.correspondent ?? 'Unknown'))];
    correspondents.forEach((c, i) => {
      colors[c] = PALETTE[i % PALETTE.length];
    });
    return colors;
  });

  let nodeMap = $derived(new Map(data.graph.nodes.map((n) => [n.id, n])));

  function edgeColor(e: GraphEdge): string {
    if (e.resolved) return '#22c55e'; // green
    if (e.reviewed) return '#f59e0b'; // amber
    return '#6366f1'; // blue/indigo
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartOption: any = $derived({
    tooltip: {
      trigger: 'item',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const d = params.data as { name: string; meta: GraphNode };
          return [
            `<strong>${d.meta.title}</strong>`,
            `Correspondent: ${d.meta.correspondent ?? 'N/A'}`,
            `Type: ${d.meta.documentType ?? 'N/A'}`,
            `Groups: ${d.meta.groupCount}`,
          ].join('<br/>');
        }
        if (params.dataType === 'edge') {
          const d = params.data as { meta: GraphEdge };
          const source = nodeMap.get(d.meta.source);
          const target = nodeMap.get(d.meta.target);
          const status = d.meta.resolved ? 'Resolved' : d.meta.reviewed ? 'Reviewed' : 'Pending';
          return [
            `<strong>${(d.meta.confidenceScore * 100).toFixed(0)}% confidence</strong>`,
            `${source?.title ?? '?'} &harr; ${target?.title ?? '?'}`,
            `Status: ${status}`,
          ].join('<br/>');
        }
        return '';
      },
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
            color: correspondentColors()[n.correspondent ?? 'Unknown'] ?? '#94a3b8',
          },
          meta: n,
        })),
        edges: data.graph.edges.map((e) => ({
          source: e.source,
          target: e.target,
          lineStyle: {
            width: Math.max(1, e.confidenceScore * 5),
            color: edgeColor(e),
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
    const params = new URLSearchParams($page.url.searchParams);
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

  function handleMaxGroups(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    applyFilters({ maxGroups: value });
  }

  function handleStatusChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (value === 'all') {
      applyFilters({ reviewed: '', resolved: '' });
    } else if (value === 'pending') {
      applyFilters({ reviewed: 'false', resolved: 'false' });
    } else if (value === 'reviewed') {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const params = new URLSearchParams($page.url.searchParams);
      params.set('reviewed', 'true');
      params.delete('resolved');
      goto(`?${params.toString()}`, { replaceState: true });
    } else if (value === 'resolved') {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const params = new URLSearchParams($page.url.searchParams);
      params.set('resolved', 'true');
      params.delete('reviewed');
      goto(`?${params.toString()}`, { replaceState: true });
    }
  }

  let currentStatus = $derived(() => {
    const reviewed = $page.url.searchParams.get('reviewed');
    const resolved = $page.url.searchParams.get('resolved');
    if (resolved === 'true') return 'resolved';
    if (reviewed === 'true') return 'reviewed';
    if (reviewed === 'false' && resolved === 'false') return 'pending';
    return 'all';
  });
</script>

<svelte:head>
  <title>Similarity Graph - Paperless Dedupe</title>
</svelte:head>

<div class="space-y-4">
  <!-- Page Header -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-ink text-3xl font-bold">Similarity Graph</h1>
    </div>
    <a
      href="/duplicates"
      class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
    >
      Back to List
    </a>
  </div>

  <!-- Info Bar -->
  <div class="text-muted text-sm">
    Showing {data.graph.groupsIncluded} of {data.graph.totalGroupsMatched} groups ({data.graph.nodes
      .length} documents, {data.graph.edges.length} connections)
  </div>

  <!-- Filter Bar -->
  <div class="panel">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label for="graph-min-confidence" class="text-ink block text-sm font-medium"
          >Min Confidence</label
        >
        <input
          id="graph-min-confidence"
          type="number"
          min="0"
          max="100"
          placeholder="0"
          value={$page.url.searchParams.get('minConfidence')
            ? Math.round(Number($page.url.searchParams.get('minConfidence')) * 100)
            : ''}
          onchange={handleMinConfidence}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        />
      </div>

      <div>
        <label for="graph-max-groups" class="text-ink block text-sm font-medium">Max Groups</label>
        <select
          id="graph-max-groups"
          onchange={handleMaxGroups}
          value={$page.url.searchParams.get('maxGroups') ?? '100'}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
        </select>
      </div>

      <div>
        <label for="graph-status" class="text-ink block text-sm font-medium">Status</label>
        <select
          id="graph-status"
          onchange={handleStatusChange}
          value={currentStatus()}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Graph + Detail Panel -->
  <div class="flex gap-4">
    <!-- Graph -->
    <div class="panel min-w-0 flex-1">
      {#if data.graph.nodes.length > 0}
        <EChart option={chartOption} height="600px" onChartReady={handleChartReady} />
      {:else}
        <div class="flex h-96 items-center justify-center">
          <p class="text-muted">No data to display. Try adjusting filters or run analysis first.</p>
        </div>
      {/if}
    </div>

    <!-- Detail Panel -->
    {#if selectedNode || selectedEdge}
      <div class="panel w-80 shrink-0 space-y-4">
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
                <dd class="text-ink">
                  {selectedEdge.resolved
                    ? 'Resolved'
                    : selectedEdge.reviewed
                      ? 'Reviewed'
                      : 'Pending'}
                </dd>
              </div>
            </dl>
            <a
              href="/duplicates/{selectedEdge.groupId}"
              class="bg-accent hover:bg-accent-hover mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            >
              View Group
            </a>
          </div>
        {/if}

        <button
          onclick={() => {
            selectedNode = null;
            selectedEdge = null;
          }}
          class="text-muted hover:text-ink text-sm"
        >
          Close panel
        </button>
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="panel">
    <h3 class="text-ink mb-2 text-sm font-semibold">Legend</h3>
    <div class="flex flex-wrap gap-6 text-xs">
      <div class="space-y-1">
        <p class="text-muted font-medium">Edge Colors</p>
        <div class="flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-4 rounded" style="background: #6366f1"></span>
          <span class="text-ink">Pending</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-4 rounded" style="background: #f59e0b"></span>
          <span class="text-ink">Reviewed</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-4 rounded" style="background: #22c55e"></span>
          <span class="text-ink">Resolved</span>
        </div>
      </div>
      <div class="space-y-1">
        <p class="text-muted font-medium">Node Size</p>
        <p class="text-ink">Larger = appears in more groups</p>
      </div>
      <div class="space-y-1">
        <p class="text-muted font-medium">Node Color</p>
        <p class="text-ink">Grouped by correspondent</p>
      </div>
      <div class="space-y-1">
        <p class="text-muted font-medium">Edge Width</p>
        <p class="text-ink">Thicker = higher confidence</p>
      </div>
    </div>
  </div>
</div>
