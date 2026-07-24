import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import type { AiResultSummary, AiResultDetail, AiFieldSelection } from '@paperless-dedupe/core';

// Re-export core types for convenience
export type { AiResultSummary, AiResultDetail };

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  detail?: string;
}

// ── Selection State ──
export const selectedIds = new SvelteSet<string>();

// ── Active Detail State ──
export const activeReviewState = $state<{
  resultId: string | null;
  detail: AiResultDetail | null;
  loadState: 'idle' | 'loading' | 'loaded' | 'error';
}>({
  resultId: null,
  detail: null,
  loadState: 'idle',
});

export function getActiveResultId(): string | null {
  return activeReviewState.resultId;
}
export function getActiveResultDetail(): AiResultDetail | null {
  return activeReviewState.detail;
}
export function getDetailLoadState(): 'idle' | 'loading' | 'loaded' | 'error' {
  return activeReviewState.loadState;
}

// ── Toasts ──
let _toasts = $state<Toast[]>([]);
export function getToasts(): Toast[] {
  return _toasts;
}

// ── Field Selections for Partial Apply ──
export const fieldSelections = new SvelteMap<string, AiFieldSelection>();

interface ExtractEnabled {
  title: boolean;
  correspondent: boolean;
  documentType: boolean;
  tags: boolean;
  customFields: boolean;
  processedTag?: boolean;
}

export function createDefaultFieldSelection(
  result: AiResultSummary,
  extractEnabled: ExtractEnabled = {
    title: true,
    correspondent: true,
    documentType: true,
    tags: true,
    customFields: true,
    processedTag: false,
  },
): AiFieldSelection {
  return {
    title: Boolean(result.suggestedTitle && extractEnabled.title),
    correspondent: Boolean(result.suggestedCorrespondent && extractEnabled.correspondent),
    documentType: Boolean(result.suggestedDocumentType && extractEnabled.documentType),
    tags: result.suggestedTags.length > 0 && extractEnabled.tags,
    // Adding an operational marker must always be a conscious review choice.
    processedTag: false,
    customFieldIds: extractEnabled.customFields
      ? result.suggestedCustomFields.map((field) => field.fieldId).sort((a, b) => a - b)
      : [],
  };
}

export function toggleAiFieldSelection(
  selection: AiFieldSelection,
  field: string,
): AiFieldSelection {
  if (field.startsWith('customField:')) {
    const id = Number(field.slice('customField:'.length));
    const hasId = selection.customFieldIds.includes(id);
    return {
      ...selection,
      customFieldIds: (hasId
        ? selection.customFieldIds.filter((fieldId) => fieldId !== id)
        : [...selection.customFieldIds, id]
      ).sort((a, b) => a - b),
    };
  }
  if (
    field === 'title' ||
    field === 'correspondent' ||
    field === 'documentType' ||
    field === 'tags' ||
    field === 'processedTag'
  ) {
    return { ...selection, [field]: !selection[field] };
  }
  return selection;
}

// ── Selection Functions ──
export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
}

export function selectAllIds(ids: string[]): void {
  for (const id of ids) selectedIds.add(id);
}

export function clearSelection(ids: Iterable<string>): void {
  for (const id of ids) selectedIds.delete(id);
}

export function removeSelection(id: string): void {
  selectedIds.delete(id);
}

export function pruneSelection(validIds: Set<string>): void {
  for (const id of selectedIds) {
    if (!validIds.has(id)) selectedIds.delete(id);
  }
}

// ── Detail Functions ──
export function selectResult(id: string): void {
  activeReviewState.resultId = id;
  activeReviewState.detail = null;
  activeReviewState.loadState = 'loading';
}

export function closeDetail(): void {
  activeReviewState.resultId = null;
  activeReviewState.detail = null;
  activeReviewState.loadState = 'idle';
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
  const currentIndex = results.findIndex((r) => r.id === activeReviewState.resultId);
  const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
  selectResult(results[nextIndex].id);
}

export function selectPrevResult(results: AiResultSummary[]): void {
  if (results.length === 0) return;
  const currentIndex = results.findIndex((r) => r.id === activeReviewState.resultId);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
  selectResult(results[prevIndex].id);
}

// ── Field Selection Functions ──
export function getFieldSelection(
  resultId: string,
  result: AiResultSummary,
  extractEnabled?: ExtractEnabled,
): AiFieldSelection {
  if (!fieldSelections.has(resultId)) {
    fieldSelections.set(resultId, createDefaultFieldSelection(result, extractEnabled));
  }
  return fieldSelections.get(resultId)!;
}

export function initializeFieldSelection(
  resultId: string,
  result: AiResultSummary,
  extractEnabled?: ExtractEnabled,
): AiFieldSelection {
  const existing = fieldSelections.get(resultId);
  if (existing) return existing;
  const selection = createDefaultFieldSelection(result, extractEnabled);
  fieldSelections.set(resultId, selection);
  return selection;
}

export function toggleField(resultId: string, field: string): void {
  const selection = fieldSelections.get(resultId);
  if (!selection) return;
  fieldSelections.set(resultId, toggleAiFieldSelection(selection, field));
}

export function setFieldSelection(resultId: string, selection: AiFieldSelection): void {
  fieldSelections.set(resultId, selection);
}

// ── Cleanup ──
export function resetStore(): void {
  selectedIds.clear();
  activeReviewState.resultId = null;
  activeReviewState.detail = null;
  activeReviewState.loadState = 'idle';
  _toasts = [];
  fieldSelections.clear();
}
