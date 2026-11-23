// A whole type-only import keeps the server-only core module out of the browser bundle.
type GraphEdge = import('@paperless-dedupe/core').GraphEdge;
type GraphNode = import('@paperless-dedupe/core').GraphNode;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  false_positive: 'False Positive',
  ignored: 'Ignored',
  deleted: 'Deleted',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** ECharts assigns a formatter's string to innerHTML, so every synced value is escaped here. */
export function formatGraphTooltip(
  params: { dataType?: string; data?: unknown },
  nodes: ReadonlyMap<string, GraphNode>,
): string {
  if (params.dataType === 'node') {
    const { meta } = params.data as { meta: GraphNode };
    return [
      `<strong>${escapeHtml(meta.title)}</strong>`,
      `Correspondent: ${escapeHtml(meta.correspondent ?? 'N/A')}`,
      `Type: ${escapeHtml(meta.documentType ?? 'N/A')}`,
      `Groups: ${meta.groupCount}`,
    ].join('<br/>');
  }
  if (params.dataType === 'edge') {
    const { meta } = params.data as { meta: GraphEdge };
    const source = escapeHtml(nodes.get(meta.source)?.title ?? '?');
    const target = escapeHtml(nodes.get(meta.target)?.title ?? '?');
    return [
      `<strong>${(meta.confidenceScore * 100).toFixed(0)}% confidence</strong>`,
      `${source} &harr; ${target}`,
      `Status: ${escapeHtml(STATUS_LABELS[meta.status] ?? meta.status)}`,
    ].join('<br/>');
  }
  return '';
}
