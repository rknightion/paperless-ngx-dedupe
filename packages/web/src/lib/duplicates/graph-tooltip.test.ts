import { expect, it } from 'vitest';
import { type GraphEdge, type GraphNode } from '@paperless-dedupe/core';
import { formatGraphTooltip } from './graph-tooltip';

const markup = '<img src=x onerror=alert(1)>';
const node = {
  id: 'one',
  title: markup,
  correspondent: markup,
  documentType: markup,
  groupCount: 2,
} as GraphNode;

it('renders synced node values as text', () => {
  const html = formatGraphTooltip({ dataType: 'node', data: { meta: node } }, new Map());
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain('<strong>');
});

it('renders synced edge endpoints and unknown statuses as text', () => {
  const edge = {
    source: 'one',
    target: 'two',
    confidenceScore: 0.91,
    status: markup,
  } as unknown as GraphEdge;
  const nodes = new Map([
    ['one', node],
    ['two', { ...node, id: 'two', title: 'A & B' }],
  ]);
  const html = formatGraphTooltip({ dataType: 'edge', data: { meta: edge } }, nodes);
  expect(html).not.toContain('<img');
  expect(html).toContain('A &amp; B');
  expect(html).toContain('91% confidence');
});
