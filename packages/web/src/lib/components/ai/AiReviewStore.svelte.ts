import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import type { AiResultSummary, AiResultDetail, AiResultFilters } from '@paperless-dedupe/core';

// Re-export core types for convenience
export type { AiResultSummary, AiResultDetail };

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  detail?: string;
}

// ── Selection Mode ──
export type SelectionMode =
  | { type: 'manual' }
  | { type: 'all_matching_filter'; filters: AiResultFilters; matchCount: number };

let _selectionMode = $state<SelectionMode>({ type: 'manual' });

export function getSelectionMode(): SelectionMode {
  return _selectionMode;
}

export function selectAllMatchingFilter(filters: AiResultFilters, matchCount: number): void {
  _selectionMode = { type: 'all_matching_filter', filters, matchCount };
  selectedIds.clear();
}

export function clearFilterSelection(): void {
  _selectionMode = { type: 'manual' };
}

// ── Selection State ──
export const selectedIds = new SvelteSet<string>();

// ── Active Detail State ──
let _activeResultId = $state<string | null>(null);
let _activeResultDetail = $state<AiResultDetail | null>(null);
let _detailLoadState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');

export function getActiveResultId(): string | null {
  return _activeResultId;
}
export function getActiveResultDetail(): AiResultDetail | null {
  return _activeResultDetail;
}
export function getDetailLoadState(): 'idle' | 'loading' | 'loaded' | 'error' {
  return _detailLoadState;
}

// ── Toasts ──
let _toasts = $state<Toast[]>([]);
export function getToasts(): Toast[] {
  return _toasts;
}

// ── Field Selections for Partial Apply ──
export const fieldSelections = new SvelteMap<string, SvelteSet<string>>();

// ── Selection Functions ──
export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
}

export function selectAllIds(ids: string[]): void {
  selectedIds.clear();
  for (const id of ids) selectedIds.add(id);
}

export function clearSelection(): void {
  selectedIds.clear();
}

export function pruneSelection(validIds: Set<string>): void {
  for (const id of selectedIds) {
    if (!validIds.has(id)) selectedIds.delete(id);
  }
}

// ── Detail Functions ──
export async function selectResult(id: string): Promise<void> {
  _activeResultId = id;
  _detailLoadState = 'loading';
  _activeResultDetail = null;

  try {
    const res = await fetch(`/api/v1/ai/results/${id}`);
    if (!res.ok) throw new Error('Failed to load result');
    const json = await res.json();
    // Only update if this is still the active result (prevent race conditions)
    if (_activeResultId === id) {
      _activeResultDetail = json.data;
      _detailLoadState = 'loaded';
    }
  } catch {
    if (_activeResultId === id) {
      _detailLoadState = 'error';
    }
  }
}

export function closeDetail(): void {
  _activeResultId = null;
  _activeResultDetail = null;
  _detailLoadState = 'idle';
}

// ── Toast Functions ──
let toastCounter = 0;

export function addToast(
  type: Toast['type'],
  message: string,
  detail?: string,
  durationMs?: number,
): void {
  const id = `toast-${++toastCounter}`;
  _toasts = [..._toasts, { id, type, message, detail }];

  const duration = durationMs ?? (type === 'error' ? 10000 : 5000);
  setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
}

// ── Keyboard Nav Functions ──
export function selectNextResult(results: AiResultSummary[]): void {
  if (results.length === 0) return;
  const currentIndex = results.findIndex((r) => r.id === _activeResultId);
  const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
  selectResult(results[nextIndex].id);
}

export function selectPrevResult(results: AiResultSummary[]): void {
  if (results.length === 0) return;
  const currentIndex = results.findIndex((r) => r.id === _activeResultId);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
  selectResult(results[prevIndex].id);
}

// ── Field Selection Functions ──
export function getFieldSelection(resultId: string, result: AiResultSummary): SvelteSet<string> {
  if (!fieldSelections.has(resultId)) {
    const defaults = new SvelteSet<string>();
    if (result.suggestedCorrespondent) defaults.add('correspondent');
    if (result.suggestedDocumentType) defaults.add('documentType');
    if (result.suggestedTags.length > 0) defaults.add('tags');
    fieldSelections.set(resultId, defaults);
  }
  return fieldSelections.get(resultId)!;
}

export function toggleField(resultId: string, field: string): void {
  const selection = fieldSelections.get(resultId);
  if (!selection) return;
  if (selection.has(field)) {
    selection.delete(field);
  } else {
    selection.add(field);
  }
}

// ── Cleanup ──
export function resetStore(): void {
  selectedIds.clear();
  _selectionMode = { type: 'manual' };
  _activeResultId = null;
  _activeResultDetail = null;
  _detailLoadState = 'idle';
  _toasts = [];
  fieldSelections.clear();
}
