import { useEffect, useCallback, useRef } from 'react';

type ShortcutHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  handler: ShortcutHandler;
  description?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  ignoreInputElements?: boolean;
  scope?: 'global' | 'local';
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const {
    enabled = true,
    ignoreInputElements = true,
    scope = 'global',
  } = options;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Skip if user is typing in an input element
      if (ignoreInputElements) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.contentEditable === 'true'
        ) {
          return;
        }
      }

      // Find matching shortcut
      const matchingShortcut = shortcutsRef.current.find((shortcut) => {
        if (shortcut.enabled === false) return false;

        const keyMatches =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          event.code.toLowerCase() === shortcut.key.toLowerCase();

        const modifiersMatch =
          (shortcut.ctrl === undefined || shortcut.ctrl === event.ctrlKey) &&
          (shortcut.alt === undefined || shortcut.alt === event.altKey) &&
          (shortcut.shift === undefined || shortcut.shift === event.shiftKey) &&
          (shortcut.meta === undefined || shortcut.meta === event.metaKey);

        return keyMatches && modifiersMatch;
      });

      if (matchingShortcut) {
        if (matchingShortcut.preventDefault !== false) {
          event.preventDefault();
        }
        if (matchingShortcut.stopPropagation !== false) {
          event.stopPropagation();
        }
        matchingShortcut.handler(event);
      }
    },
    [enabled, ignoreInputElements]
  );

  useEffect(() => {
    if (!enabled) return;

    const targetElement = scope === 'global' ? window : document;
    targetElement.addEventListener('keydown', handleKeyDown as any);

    return () => {
      targetElement.removeEventListener('keydown', handleKeyDown as any);
    };
  }, [enabled, scope, handleKeyDown]);

  return {
    shortcuts: shortcuts.map((s) => ({
      key: s.key,
      ctrl: s.ctrl,
      alt: s.alt,
      shift: s.shift,
      meta: s.meta,
      description: s.description,
    })),
  };
}

// Helper function to format shortcut for display
export function formatShortcut(shortcut: {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}): string {
  const parts = [];
  if (shortcut.meta) parts.push('⌘');
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join('+');
}

// Common shortcut patterns
export const COMMON_SHORTCUTS = {
  NAVIGATE_UP: { key: 'k', description: 'Navigate up' },
  NAVIGATE_DOWN: { key: 'j', description: 'Navigate down' },
  NAVIGATE_LEFT: { key: 'h', description: 'Navigate left' },
  NAVIGATE_RIGHT: { key: 'l', description: 'Navigate right' },
  SELECT: { key: 'Enter', description: 'Select/Open' },
  TOGGLE_SELECT: { key: ' ', description: 'Toggle selection' },
  SELECT_ALL: { key: 'a', ctrl: true, description: 'Select all' },
  DESELECT_ALL: { key: 'Escape', description: 'Deselect all' },
  DELETE: { key: 'd', description: 'Delete' },
  REVIEW: { key: 'r', description: 'Mark as reviewed' },
  HELP: { key: '?', description: 'Show help' },
  SEARCH: { key: '/', description: 'Focus search' },
  REFRESH: { key: 'r', ctrl: true, description: 'Refresh' },
  PREVIOUS_PAGE: { key: 'ArrowLeft', description: 'Previous page' },
  NEXT_PAGE: { key: 'ArrowRight', description: 'Next page' },
};
