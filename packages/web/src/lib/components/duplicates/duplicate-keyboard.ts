export type DuplicateKeyboardAction =
  'not-duplicate' | 'keep-all' | 'delete' | 'skip' | 'compare' | 'primary' | 'help';

interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

export interface DuplicateShortcutState {
  dialogOpen: boolean;
  pending: boolean;
  canDelete: boolean;
  hasNext: boolean;
  secondaryCount: number;
  canSetPrimary: boolean;
}

/** Resolve review keys without changing focus, preventing defaults or performing an action. */
export function resolveDuplicateShortcut(
  event: ShortcutEvent,
  state: DuplicateShortcutState,
): DuplicateKeyboardAction | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    state.dialogOpen ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey
  )
    return null;
  const target = event.target;
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? ''))
    return null;
  if (event.key === '?') return 'help';
  if (event.key === 'n' && state.pending) return 'not-duplicate';
  if (event.key === 'k' && state.pending) return 'keep-all';
  if (event.key === 'd' && state.pending && state.canDelete) return 'delete';
  if (event.key === 's' && state.hasNext) return 'skip';
  if (/^[1-9]$/.test(event.key) && Number(event.key) <= state.secondaryCount) return 'compare';
  if (event.key === 'p' && state.canSetPrimary) return 'primary';
  return null;
}
