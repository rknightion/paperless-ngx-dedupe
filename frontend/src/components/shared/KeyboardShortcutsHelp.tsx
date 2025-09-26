import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { formatShortcut } from '../../hooks/useKeyboardShortcuts';
import { X } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    description: string;
    key2?: string;
  }>;
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  shortcutGroups?: ShortcutGroup[];
}

const defaultShortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: 'j', description: 'Move down / Next item' },
      { key: 'k', description: 'Move up / Previous item' },
      { key: 'Enter', description: 'Open / Select item' },
      { key: 'Escape', description: 'Close / Cancel' },
      { key: '/', description: 'Focus search' },
      { key: 'ArrowLeft', description: 'Previous page' },
      { key: 'ArrowRight', description: 'Next page' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { key: 'Space', description: 'Toggle selection' },
      { key: 'a', shift: true, description: 'Select all visible' },
      { key: 'a', ctrl: true, description: 'Select all (across pages)' },
      { key: 'Escape', description: 'Clear selection' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { key: 'r', description: 'Mark as reviewed' },
      { key: 'd', description: 'Delete selected' },
      { key: 'o', description: 'Open in Paperless' },
      { key: 'c', description: 'Compare documents' },
      { key: 'r', ctrl: true, description: 'Refresh data' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { key: 'v', description: 'Toggle view mode' },
      { key: 'f', description: 'Toggle filters' },
      { key: 'i', description: 'Show info panel' },
      { key: '1', description: 'List view' },
      { key: '2', description: 'Grid view' },
      { key: '3', description: 'Compact view' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { key: '?', description: 'Show keyboard shortcuts' },
      { key: 'g', description: 'Go to...' },
      { key: 'g', key2: 'd', description: 'Go to Dashboard' },
      { key: 'g', key2: 'u', description: 'Go to Duplicates' },
      { key: 'g', key2: 'o', description: 'Go to Documents' },
      { key: 'g', key2: 's', description: 'Go to Settings' },
    ],
  },
];

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  open,
  onClose,
  shortcutGroups = defaultShortcutGroups,
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Keyboard Shortcuts
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Press{' '}
              <Badge variant="outline" className="mx-1">
                ?
              </Badge>
              anytime to show this help. Most shortcuts work when not typing in
              an input field.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {shortcutGroups.map((group, index) => (
              <div key={index} className="space-y-3">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, shortcutIndex) => (
                    <div
                      key={shortcutIndex}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        <ShortcutKey shortcut={shortcut} />
                        {shortcut.key2 && (
                          <>
                            <span className="text-xs text-muted-foreground mx-1">
                              then
                            </span>
                            <ShortcutKey shortcut={{ key: shortcut.key2 }} />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>
                <strong>Navigation keys:</strong> Vim-style (j/k/h/l) for
                movement
              </div>
              <div>
                Press{' '}
                <Badge variant="outline" className="mx-1">
                  Escape
                </Badge>{' '}
                to close
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Helper component for displaying a shortcut key
const ShortcutKey: React.FC<{
  shortcut: {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}> = ({ shortcut }) => {
  const formattedKey = formatShortcut(shortcut);
  const parts = formattedKey.split('+');

  return (
    <div className="flex items-center gap-1">
      {parts.map((part, index) => (
        <kbd
          key={index}
          className="px-2 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
        >
          {part}
        </kbd>
      ))}
    </div>
  );
};

export default KeyboardShortcutsHelp;
